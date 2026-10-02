import { DateParts, daysBetween, LocalDate, parseLocalDate } from '@pd/contracts';

const PLAY_MILESTONES = [
  100, 250, 500, 1000, 2500, 5000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000,
];

/** What happened to a track since the last sync — for a notification. */
export interface TrackNews {
  title: string;
  permalinkUrl: string;
  /** The highest round number of plays the track crossed. */
  playsMilestone: number | null;
  newComments: number;
}

interface Counters {
  plays: number;
  comments: number;
}

/**
 * The news of a track between two readings; `null` — nothing worth a message.
 * 480 → 1,030 plays is "1,000" (500 is not told separately — the largest is enough).
 */
export function trackNews(
  track: { title: string; permalinkUrl: string },
  previous: Counters,
  current: Counters,
): TrackNews | null {
  const crossed = PLAY_MILESTONES.filter(
    (milestone) => previous.plays < milestone && current.plays >= milestone,
  );
  const playsMilestone = crossed.length > 0 ? crossed[crossed.length - 1] : null;
  const newComments = Math.max(0, current.comments - previous.comments);
  return playsMilestone || newComments > 0 ? { ...track, playsMilestone, newComments } : null;
}

/**
 * Growth of a counter over the last `days` days from its daily history. If the history is
 * shorter, it is counted from the earliest point.
 */
export function growth(
  history: { day: LocalDate; value: number }[],
  current: number,
  today: DateParts,
  days: number,
): number {
  if (history.length === 0) {
    return 0;
  }
  const sorted = [...history].sort((a, b) => a.day.localeCompare(b.day));
  const baseline =
    [...sorted].reverse().find((point) => daysBetween(parseLocalDate(point.day), today) >= days) ??
    sorted[0];
  return current - baseline.value;
}
