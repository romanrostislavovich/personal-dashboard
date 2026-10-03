import { ActivityStats } from '@pd/contracts';

/** What the summary of a day says, in numbers; the text is made by `activityMessages`. */
export interface DaySummary {
  totalSeconds: number;
  /** The top categories of the day. */
  categories: { category: string; seconds: number }[];
  focus: { completed: number; seconds: number };
  /** Limits reached today: their kind (and program) and minutes. */
  limits: { label: string; minutes: number }[];
}

/** Less than this at the computer is not a day worth summing up. */
export const SUMMARY_MIN_SECONDS = 10 * 60;

export function summaryOf(
  stats: ActivityStats,
  focus: { completed: number; seconds: number },
  limits: DaySummary['limits'],
): DaySummary | null {
  if (stats.totalSeconds < SUMMARY_MIN_SECONDS) {
    return null;
  }
  return {
    totalSeconds: stats.totalSeconds,
    categories: stats.categories.slice(0, 3),
    focus,
    limits,
  };
}

/** Whether the summary is due: the user's time has come and today's was not handled yet. */
export function isSummaryDue(
  time: string | null,
  sentOn: string | null,
  now: { date: string; time: string },
): boolean {
  return !!time && sentOn !== now.date && now.time >= time;
}
