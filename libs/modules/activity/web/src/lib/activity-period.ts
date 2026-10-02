import { ActivityTimelineEntry, LocalDate } from '@pd/contracts';

/** Periods of the statistics, in days; `1` is today. */
export const ACTIVITY_PERIODS = [1, 7, 30, 90, 365] as const;
export type ActivityPeriodDays = (typeof ACTIVITY_PERIODS)[number];

// The browser is on the user's own clock, so local dates are simply the device's.

/** A day on this device: `YYYY-MM-DD`. */
export function localDay(at: Date = new Date()): LocalDate {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** The last `days` days, today included. */
export function lastDays(days: number, now: Date = new Date()): { from: LocalDate; to: LocalDate } {
  const from = new Date(now);
  from.setDate(from.getDate() - (days - 1));
  return { from: localDay(from), to: localDay(now) };
}

/** Spans closer than this are one stretch: the tracker cuts a long one every few minutes. */
const SAME_STRETCH_GAP_MS = 15_000;

/**
 * The tracker sends a window that stays in front as several spans. For reading they are joined
 * back: the same window of the same device with no gap in between. Newest first, as received.
 */
export function joinTimeline(entries: ActivityTimelineEntry[]): ActivityTimelineEntry[] {
  const joined: ActivityTimelineEntry[] = [];
  for (const entry of entries) {
    const later = joined.at(-1);
    const continues =
      later &&
      later.app === entry.app &&
      later.title === entry.title &&
      later.deviceId === entry.deviceId &&
      Date.parse(later.startedAt) - Date.parse(entry.endedAt) <= SAME_STRETCH_GAP_MS;
    if (continues) {
      joined[joined.length - 1] = { ...later, startedAt: entry.startedAt };
    } else {
      joined.push(entry);
    }
  }
  return joined;
}

export function secondsOf(entry: ActivityTimelineEntry): number {
  return Math.round((Date.parse(entry.endedAt) - Date.parse(entry.startedAt)) / 1000);
}
