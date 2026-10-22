import { addDays, LocalDate, parseLocalDate, toLocalDate, zonedToUtc } from '@pd/contracts';
import { daysOf } from './activity-stats';

/**
 * A stretch of time in milliseconds since 1970: what the tracker, the browser extension and
 * WakaTime record is put together by the clock with these.
 */
export interface TimeSpan {
  start: number;
  end: number;
}

export const spanOf = (row: { startedAt: Date; endedAt: Date }): TimeSpan => ({
  start: row.startedAt.getTime(),
  end: row.endedAt.getTime(),
});

/** The stretches as one time: sorted, overlapping and touching ones joined. */
export function mergeSpans(spans: readonly TimeSpan[]): TimeSpan[] {
  const sorted = spans.filter((span) => span.end > span.start).sort((a, b) => a.start - b.start);
  const merged: TimeSpan[] = [];
  for (const span of sorted) {
    const last = merged.at(-1);
    if (last && span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

/** The time of `spans` that is not in `cut`: what one source adds to another. */
export function subtractSpans(spans: readonly TimeSpan[], cut: readonly TimeSpan[]): TimeSpan[] {
  const away = mergeSpans(cut);
  const left: TimeSpan[] = [];
  for (const span of mergeSpans(spans)) {
    let start = span.start;
    for (const hole of away) {
      if (hole.end <= start || hole.start >= span.end) {
        continue;
      }
      if (hole.start > start) {
        left.push({ start, end: hole.start });
      }
      start = Math.max(start, hole.end);
    }
    if (start < span.end) {
      left.push({ start, end: span.end });
    }
  }
  return left;
}

/** Whole seconds of the stretches, what overlaps counted once. */
export function spanSeconds(spans: readonly TimeSpan[]): number {
  return Math.round(
    mergeSpans(spans).reduce((total, span) => total + span.end - span.start, 0) / 1000,
  );
}

/** The days of a period on the user's clock, each with its beginning and end. */
export function dayBounds(
  period: { from: LocalDate; to: LocalDate },
  timeZone: string,
): { day: LocalDate; start: number; end: number }[] {
  return daysOf(period.from, period.to).map((day) => ({
    day,
    start: zonedToUtc({ date: day, time: '00:00' }, timeZone).getTime(),
    end: zonedToUtc(
      { date: toLocalDate(addDays(parseLocalDate(day), 1)), time: '00:00' },
      timeZone,
    ).getTime(),
  }));
}

/** The seconds of the stretches on each day; a stretch over midnight is shared by its days. */
export function secondsByDay(
  spans: readonly TimeSpan[],
  days: readonly { day: LocalDate; start: number; end: number }[],
): Map<LocalDate, number> {
  const byDay = new Map<LocalDate, number>();
  const merged = mergeSpans(spans);
  for (const { day, start, end } of days) {
    let ms = 0;
    for (const span of merged) {
      ms += Math.max(0, Math.min(end, span.end) - Math.max(start, span.start));
    }
    if (ms >= 1000) {
      byDay.set(day, Math.round(ms / 1000));
    }
  }
  return byDay;
}
