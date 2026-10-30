import {mergeSpans, subtractSpans, TimeSpan} from './time-spans';

/**
 * The longest break between two moments of work on a project that what fills it still counts
 * as that work: from the IDE to the browser with the running app and back is one task.
 */
export const CONTEXT_GAP_MS = 10 * 60_000;

/** A stretch of a window or of a site, with what it is known to be. */
export interface WorkPiece extends TimeSpan {
  kind: 'window' | 'site';
  /** The program of a window; `null` for a site. */
  app: string | null;
  /** The title of a window, or the site. */
  label: string;
  /** The project its name or a rule gives; `null` — none. */
  projectId: string | null;
  /** Games, chats, films, a distracting site: never counted to a project by what is around. */
  leisure: boolean;
}

/** The time of a project and where it came from. */
export interface ProjectTime {
  /** All of it, what overlaps counted once. */
  spans: TimeSpan[];
  /** Pieces given to the project by what is around them (see `nearProject`). */
  context: WorkPiece[];
  /** The part only the context gives. */
  fromContext: TimeSpan[];
  /** The part only the IDE (WakaTime) gives. */
  fromCoding: TimeSpan[];
}

/**
 * Whether a stretch lies in work on the project: during a moment of it, or in a break between
 * two moments no longer than CONTEXT_GAP_MS. `anchors` — merged, sorted.
 */
export function nearProject(
  span: TimeSpan,
  anchors: readonly TimeSpan[],
): boolean {
  // The first anchor that ends after the stretch begins.
  let low = 0;
  let high = anchors.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (anchors[middle].end <= span.start) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const next = anchors[low];
  if (next && next.start < span.end) {
    return true; // They overlap.
  }
  const previous = anchors[low - 1];
  return !!previous && !!next && next.start - previous.end <= CONTEXT_GAP_MS;
}

/**
 * The time of a project: the windows and sites its name or a rule names, the IDE's stretches
 * on it (`coding`, on whichever computer), and what lies in work on it — a window or a site of
 * no project between two moments of it (see nearProject). A piece of another project or of
 * leisure is never taken.
 */
export function projectTime(
  pieces: readonly WorkPiece[],
  projectId: string,
  coding: readonly TimeSpan[],
): ProjectTime {
  const own = pieces.filter(piece => piece.projectId === projectId);
  const anchors = mergeSpans([...own, ...coding]);
  const context = pieces.filter(
    piece =>
      piece.projectId === null && !piece.leisure && nearProject(piece, anchors),
  );
  return {
    spans: mergeSpans([...anchors, ...context]),
    context,
    fromContext: subtractSpans(context, anchors),
    fromCoding: subtractSpans(coding, [...own, ...context]),
  };
}
