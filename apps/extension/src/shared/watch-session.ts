import type { WatchHints, WatchViewInput } from '@pd/contracts';

/*
 * What plays, as views: a content script reports every few seconds that a video plays in its
 * frame (where it stands, how long it is, and — the page itself — what the page says it is); the
 * reports of one page make one view. Time counts by the clock between reports, so two frames
 * playing at once (an advert and the film) never count twice, and a pause longer than a report
 * or two adds nothing.
 */

/** How often a content script reports while a video plays. */
export const WATCH_REPORT_MS = 15_000;
/** At most this much time counts between two reports (a missed report or two). */
const MAX_STEP_MS = 40_000;
/** No report for this long: the view is over (paused, closed, another page). */
export const WATCH_GAP_MS = 3 * 60_000;
/** A view shorter than this is a trailer, a preview, a click through: not sent. */
export const WATCH_MIN_SECONDS = 180;

/** One report of a content script. */
export interface WatchReport {
  /** Sent by the page itself, not by a frame inside it (a player of another site). */
  top: boolean;
  positionSeconds: number;
  durationSeconds: number | null;
  /** What the page says plays (only the page itself reads it). */
  hints: WatchHints | null;
}

export interface WatchSession {
  id: string;
  /** The page's address: kept only here, never sent (another page is another view). */
  page: string;
  site: string;
  hints: WatchHints;
  startedAt: number;
  lastAt: number;
  watchedMs: number;
  positionSeconds: number;
  durationSeconds: number | null;
}

/**
 * A report into the views of a tab: the same page within the gap goes on its view, anything else
 * closes it (returned to be sent) and starts a new one.
 */
export function takeReport(
  open: WatchSession | null,
  report: WatchReport,
  page: { url: string; site: string; hints: WatchHints },
  now: number,
  newId: () => string,
): { open: WatchSession; closed: WatchSession | null } {
  if (open && open.page === page.url && now - open.lastAt < WATCH_GAP_MS) {
    return {
      open: {
        ...open,
        hints: mergeHints(open.hints, page.hints),
        lastAt: now,
        watchedMs: open.watchedMs + Math.min(Math.max(now - open.lastAt, 0), MAX_STEP_MS),
        positionSeconds: report.positionSeconds,
        durationSeconds: report.durationSeconds ?? open.durationSeconds,
      },
      closed: null,
    };
  }
  return {
    open: {
      id: newId(),
      page: page.url,
      site: page.site,
      hints: page.hints,
      startedAt: now,
      lastAt: now,
      watchedMs: 0,
      positionSeconds: report.positionSeconds,
      durationSeconds: report.durationSeconds,
    },
    closed: open,
  };
}

/** A hint read later wins when it says something (Netflix shows its title a moment after). */
export function mergeHints(old: WatchHints, fresh: WatchHints): WatchHints {
  const merged: WatchHints = { ...old };
  for (const [key, value] of Object.entries(fresh) as [keyof WatchHints, string | undefined][]) {
    if (value?.trim()) {
      merged[key] = value.trim().slice(0, 300);
    }
  }
  return merged;
}

export function worthSending(session: WatchSession): boolean {
  return session.watchedMs / 1000 >= WATCH_MIN_SECONDS;
}

/** A view as the server takes it: the site, never the page's address. */
export function toViewInput(session: WatchSession): WatchViewInput {
  return {
    id: session.id,
    site: session.site,
    hints: session.hints,
    startedAt: new Date(session.startedAt).toISOString(),
    endedAt: new Date(Math.max(session.lastAt, session.startedAt + 1000)).toISOString(),
    watchedSeconds: Math.round(session.watchedMs / 1000),
    positionSeconds: Math.max(0, Math.round(session.positionSeconds)),
    durationSeconds:
      session.durationSeconds && Number.isFinite(session.durationSeconds)
        ? Math.round(session.durationSeconds)
        : null,
  };
}
