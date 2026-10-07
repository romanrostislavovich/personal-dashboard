import { ActivityTimelineEntry, zonedDateTime } from '@pd/contracts';

/** A stretch of the day in one window, as the assistant gets it. */
export interface TimelineStretch {
  /** On the user's own clock, `HH:mm`. */
  from: string;
  to: string;
  minutes: number;
  app: string;
  title: string;
  category: string;
}

export interface TimelineDigest {
  /** Stretches in the hours asked for, before `limit` cut the list. */
  total: number;
  /** Oldest first. */
  stretches: TimelineStretch[];
  /** Set when the list was cut: how to get the rest. */
  note?: string;
}

/** A switch away shorter than this does not break a stretch: a glance at a message is not work. */
const SAME_WINDOW_GAP_MS = 60_000;

/**
 * A day of windows made readable: a computer records hundreds of spans a day, most of them the
 * same window after a second in another one. Neighbouring spans of one window become one
 * stretch, times go on the user's own clock, and the list may be narrowed to hours of the day.
 */
export function digestTimeline(
  entries: ActivityTimelineEntry[],
  timeZone: string,
  { fromTime, toTime, limit }: { fromTime?: string; toTime?: string; limit: number },
): TimelineDigest {
  const oldestFirst = [...entries].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const merged: { start: Date; end: Date; entry: ActivityTimelineEntry }[] = [];
  for (const entry of oldestFirst) {
    const start = new Date(entry.startedAt);
    const end = new Date(entry.endedAt);
    const last = merged[merged.length - 1];
    if (
      last &&
      last.entry.app === entry.app &&
      last.entry.title === entry.title &&
      start.getTime() - last.end.getTime() <= SAME_WINDOW_GAP_MS
    ) {
      last.end = end;
    } else {
      merged.push({ start, end, entry });
    }
  }

  const stretches = merged
    .map(({ start, end, entry }) => ({
      from: zonedDateTime(start, timeZone).time,
      to: zonedDateTime(end, timeZone).time,
      minutes: Math.round((end.getTime() - start.getTime()) / 60_000),
      app: entry.name || entry.app,
      title: entry.title,
      category: entry.category,
    }))
    // A stretch counts when any part of it lies in the hours asked for.
    .filter(
      (stretch) => (!fromTime || stretch.to >= fromTime) && (!toTime || stretch.from <= toTime),
    );

  if (stretches.length <= limit) {
    return { total: stretches.length, stretches };
  }
  // The longest ones tell what the time went to; they are shown in the order of the day.
  const longest = [...stretches].sort((a, b) => b.minutes - a.minutes).slice(0, limit);
  return {
    total: stretches.length,
    stretches: stretches.filter((stretch) => longest.includes(stretch)),
    note:
      `Only the ${limit} longest of ${stretches.length} stretches are shown. ` +
      'Narrow the hours with fromTime / toTime to see everything in them.',
  };
}
