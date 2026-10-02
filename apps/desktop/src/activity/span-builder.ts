/** The window in front at one moment, as the watcher sees it. */
export interface WindowSample {
  /** The name of the process (`chrome`). */
  app: string;
  /** The name people know the program by, when the system tells it. */
  name: string | null;
  title: string;
  /** The window covers its whole monitor: a video or a game. */
  fullscreen: boolean;
}

/** A stretch of time one window was in front — what is sent to the server. */
export interface Span {
  app: string;
  appName: string | null;
  title: string;
  startedAt: string;
  endedAt: string;
}

/** A span is cut at this length: a long session reaches the server in pieces, as it goes. */
const MAX_SPAN_MS = 5 * 60 * 1000;
/** Shorter than this is a window flashing by, not time spent. */
const MIN_SPAN_MS = 1000;

/**
 * Turns the samples of the watcher into spans. The same window in a row is one span; another
 * window, or nothing to record (the user is away, the tracker is paused, the program is
 * excluded), closes it. `feed` returns the span that was closed, if one was.
 */
export class SpanBuilder {
  private open: { sample: WindowSample; startedAt: number; lastSeenAt: number } | null = null;

  /** `sample` — what is in front at `at`; `null` — there is nothing to record from `at` on. */
  feed(sample: WindowSample | null, at: number): Span | null {
    const open = this.open;
    if (!open) {
      this.open = sample ? { sample, startedAt: at, lastSeenAt: at } : null;
      return null;
    }
    const same = sample?.app === open.sample.app && sample.title === open.sample.title;
    if (same && at - open.startedAt < MAX_SPAN_MS) {
      open.lastSeenAt = at;
      return null;
    }
    // The span ends where the next begins; "nothing to record" may be told about a moment in
    // the past (the user went away a few minutes ago), never earlier than the span started.
    const endedAt = Math.max(open.startedAt, at);
    this.open = sample ? { sample, startedAt: endedAt, lastSeenAt: endedAt } : null;
    return toSpan(open.sample, open.startedAt, endedAt);
  }

  /** Closes what is open at the last moment the window was seen (the app quits, the PC sleeps). */
  flush(): Span | null {
    const open = this.open;
    this.open = null;
    return open ? toSpan(open.sample, open.startedAt, open.lastSeenAt) : null;
  }
}

function toSpan(sample: WindowSample, startedAt: number, endedAt: number): Span | null {
  if (endedAt - startedAt < MIN_SPAN_MS) {
    return null;
  }
  return {
    app: sample.app,
    appName: sample.name,
    title: sample.title,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
  };
}
