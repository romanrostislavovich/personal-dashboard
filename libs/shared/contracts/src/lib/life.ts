import { z } from 'zod';
import { LocalDate } from './local-date';

// The life timeline (a day across every module) and the summaries of a month or a year.
// Texts are translation keys of the modules: the server knows no language for them.

/** Something that happened on a day, in one module. */
export interface LifeEvent {
  module: string;
  icon: string;
  /** A translation key of the module, e.g. `finance.life.spent`. */
  key: string;
  params?: Record<string, string | number>;
  /** When in the day (ISO); `null` — the day as a whole. */
  at: string | null;
  /** A page of the dashboard to open. */
  link: string | null;
}

export interface LifeDay {
  day: LocalDate;
  /** In the order of the day; the ones without a time first. */
  events: LifeEvent[];
}

/** A number of a period: "spent 4 210 PLN", "184 hours at the computer". */
export interface LifeCard {
  module: string;
  icon: string;
  /** What the number is: a translation key of the module. */
  key: string;
  value: number;
  /** How to show the value. */
  format: 'number' | 'hours' | 'money';
  currency?: string;
  /** A line under the number: a translation key with its params. */
  detailKey?: string;
  detailParams?: Record<string, string | number>;
  /** `average` — a mean (mood), not a total: a goal on it is not split over the year. */
  aggregate?: 'sum' | 'average';
}

export interface LifeSummary {
  from: LocalDate;
  to: LocalDate;
  cards: LifeCard[];
}

const LOCAL_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const lifeDayQuerySchema = z.object({ day: LOCAL_DATE });
export type LifeDayQuery = z.infer<typeof lifeDayQuerySchema>;

export const lifeSummaryQuerySchema = z.object({ from: LOCAL_DATE, to: LOCAL_DATE });
export type LifeSummaryQuery = z.infer<typeof lifeSummaryQuerySchema>;

// --- Goals of a year ---

export const LIFE_GOAL_DIRECTIONS = ['atLeast', 'atMost'] as const;
export type LifeGoalDirection = (typeof LIFE_GOAL_DIRECTIONS)[number];

export const lifeGoalInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  year: z.number().int().min(2000).max(2100),
  /**
   * The key of a summary card counted by the modules (`diary.life.entries`, `music.life.plays`);
   * `null` — the progress is set by hand.
   */
  metric: z.string().trim().max(100).nullish(),
  target: z.number().positive().max(1_000_000_000_000),
  /** "Read at least 20 books" or "spend at most 3000 on cafes". */
  direction: z.enum(LIFE_GOAL_DIRECTIONS).default('atLeast'),
});
export type LifeGoalInput = z.input<typeof lifeGoalInputSchema>;

export type LifeGoalStatus = 'done' | 'onTrack' | 'behind' | 'failed';

export interface LifeGoal {
  id: string;
  title: string;
  year: number;
  metric: string | null;
  target: number;
  direction: LifeGoalDirection;
  /** Where it is now: counted by the module, or set by hand. */
  value: number;
  format: LifeCard['format'];
  currency?: string;
  icon: string;
  /** Where it should be today at an even pace (for an average — the target itself). */
  expected: number;
  status: LifeGoalStatus;
}

/** What a goal can be counted from: the summary cards the modules give. */
export interface LifeMetric {
  key: string;
  module: string;
  icon: string;
  format: LifeCard['format'];
  currency?: string;
}

export const lifeGoalProgressSchema = z.object({ value: z.number().min(0).max(1_000_000_000_000) });
export type LifeGoalProgress = z.infer<typeof lifeGoalProgressSchema>;

export const lifeGoalsQuerySchema = z.object({ year: z.coerce.number().int().min(2000).max(2100) });
export type LifeGoalsQuery = z.infer<typeof lifeGoalsQuerySchema>;

// --- The AI's story of a month or a year ---

/** `YYYY` or `YYYY-MM`. */
export const lifeStoryQuerySchema = z.object({
  period: z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/),
});
export type LifeStoryQuery = z.infer<typeof lifeStoryQuerySchema>;

export interface LifeStory {
  period: string;
  text: string;
  createdAt: string;
}
