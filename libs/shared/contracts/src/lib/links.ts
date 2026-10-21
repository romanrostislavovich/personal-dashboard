import { z } from 'zod';
import { LocalDate } from './local-date';

/**
 * What the sections tell each other through the core (libs/api/core/src/lib/links): a module
 * never reads another module's data, it asks the core, which asks whoever registered.
 */

// --- A project across the sections ---

/**
 * One thing a section knows about a project in a period: its hours, its money, its tasks. The
 * label is the section's own translation (`labelKey`); `metric` marks the few the core
 * calculates with (money for an hour of work).
 */
export interface ProjectFact {
  module: string;
  labelKey: string;
  value: number;
  unit: 'seconds' | 'money' | 'count' | 'percent';
  /** For `money`. */
  currency?: string;
  metric?: 'seconds' | 'codingSeconds' | 'income' | 'expense';
  /** Where the number comes from, inside the app. */
  link?: string;
  /** A line under the number: what it is made of. */
  note?: string;
}

/** Something that changed in a project at a moment: a commit, a release. */
export interface ProjectChange {
  module: string;
  at: string;
  title: string;
  /** Where it changed: the repository. */
  where: string;
  url: string | null;
}

/** A month of a project: what its hours and its money were. */
export interface ProjectMonth {
  /** `YYYY-MM` */
  month: string;
  /** Time at the computer on it, and the coding time of the IDE. */
  seconds: number;
  codingSeconds: number;
  income: number;
  expense: number;
  /** Of the money; `null` — there was none. */
  currency: string | null;
}

export const projectMonthsQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
});
export type ProjectMonthsQuery = z.infer<typeof projectMonthsQuerySchema>;

export interface ProjectOverview {
  project: { id: string; name: string; url: string | null; aliases: string[] };
  from: LocalDate;
  to: LocalDate;
  facts: ProjectFact[];
  /** The latest changes of the period, newest first. */
  changes: ProjectChange[];
  /** Money for an hour at the project, when both are known. */
  perHour: { income: number; expense: number; currency: string } | null;
}

export const projectOverviewQuerySchema = z.object({ from: z.iso.date(), to: z.iso.date() });
export type ProjectOverviewQuery = z.infer<typeof projectOverviewQuerySchema>;

// --- How much something paid for is used ---

/** Use of a service over a period, as the section that knows it counts. */
export interface ServiceUsage {
  /** The section that knows: `music`, `games`. */
  module: string;
  /** What was counted, the section's own translation: plays, hours, matches. */
  unitKey: string;
  amount: number;
  /** `null` — never seen in use. */
  lastUsedAt: string | null;
}

// --- Days in numbers, and what goes with a good or a bad day ---

/** A number a section has for every day: hours at the computer, money spent, plays. */
export interface DailyMetric {
  /** `activity.hours`: stable, the section's id first. */
  key: string;
  module: string;
  labelKey: string;
  /** A name of the user's own (a habit, a category of spending), shown instead of `labelKey`. */
  label?: string;
  /**
   * `clock` — a time of the day in hours (23.5 — half past eleven; over 24 — after midnight);
   * `percent` — a share of the day's things, 0–100 (the matches won).
   */
  unit: 'hours' | 'money' | 'count' | 'score' | 'degrees' | 'clock' | 'percent';
  currency?: string;
  /**
   * The key of a number this one is a part of (the spending on food of all the spending): the
   * two go together by themselves, so they are never compared.
   */
  partOf?: string;
  days: { day: LocalDate; value: number }[];
}

/** How a number differs between the days of a good mood and of a bad one. */
export interface MoodInsight {
  key: string;
  module: string;
  labelKey: string;
  label?: string;
  unit: DailyMetric['unit'];
  currency?: string;
  /** The average of the number on the days of each kind. */
  onGoodDays: number;
  onBadDays: number;
  /** `onGoodDays` minus `onBadDays`, in the number's own unit. */
  difference: number;
  /** `onGoodDays` against `onBadDays`, percent: -40 — forty percent less on good days. */
  differencePercent: number;
  /**
   * A reading (a temperature, a time of the day), not a quantity: it is compared by
   * `difference` — percent of it means nothing.
   */
  reading: boolean;
}

/**
 * Today's mood forecast from yesterday's numbers, by the user's own model (`GET /api/life/forecast`).
 * Shown only when `trusted`: it beat the plain guess "like the last week" on the latest days.
 */
export interface MoodForecast {
  /** The day forecast (today). */
  target: LocalDate;
  /** 1–5; null — not enough days with a mood. */
  mood: number | null;
  /** The days it learned from. */
  days: number;
  /** The mean miss of the model, and of "like the last week", on the latest days (mood points). */
  error: number | null;
  baselineError: number | null;
  trusted: boolean;
  /** What weighs most: mood points for a typical day's difference of the number. */
  drivers: { key: string; labelKey: string; label: string | null; effect: number }[];
}

export interface MoodInsights {
  from: LocalDate;
  to: LocalDate;
  /** Days with a mood in the period, and how many of them were good and bad. */
  days: number;
  goodDays: number;
  badDays: number;
  /** `false` — too few days of either kind to say anything. */
  enough: boolean;
  /** The largest differences first. */
  insights: MoodInsight[];
}

export const moodInsightsQuerySchema = z.object({ from: z.iso.date(), to: z.iso.date() });
export type MoodInsightsQuery = z.infer<typeof moodInsightsQuerySchema>;

// --- Links between the daily numbers (Life → Links) ---

/** A daily number as the links engine saw it: its days, aligned to the period. */
export interface CorrelationMetric {
  key: string;
  module: string;
  labelKey: string;
  label?: string;
  unit: DailyMetric['unit'];
  currency?: string;
  /** Days that have a value (a quantity's zero days inside its own range count). */
  days: number;
  /** The value of every day it has one: for the scatter of a pair. */
  values: { day: LocalDate; value: number }[];
}

/**
 * How two daily numbers go together. `lag` 1 — `a` of a day against `b` of the next one
 * ("a short night, a slow next day"); 0 — of the same day (then `a` and `b` are in key order).
 */
export interface Correlation {
  a: string;
  b: string;
  lag: 0 | 1;
  /** Spearman's rank correlation, −1…1. */
  rho: number;
  /** Days both have a value on. */
  n: number;
  /** The chance of a correlation this strong by accident, the days' own trends allowed for. */
  p: number;
  /** `p` corrected for how many pairs were compared (Benjamini–Hochberg). */
  q: number;
  /**
   * For a lag of a day: the correlation with `b` of the day before held fixed — whether `a`
   * tells about tomorrow's `b` more than today's `b` does (Granger's idea). `null` for lag 0.
   */
  beyondItself: number | null;
  /**
   * How much `b` changes for one unit of `a`, in their own units (least squares), on how the
   * days differ from the weeks around them.
   */
  slope: number;
  /**
   * Strong and not an accident: q under the threshold, |rho| over it, and for the next day —
   * holding beyond that day's own yesterday.
   */
  strong: boolean;
}

/** What predicts a number, the others held fixed: a multiple regression. */
export interface CorrelationRegression {
  target: string;
  /** Days with a value of the target and of every predictor. */
  n: number;
  /** The share of the target's day-to-day change the predictors explain, 0–1 (adjusted). */
  r2: number;
  terms: {
    key: string;
    /** `1` — of the day before the target's day. */
    lag: 0 | 1;
    /** Standardized coefficient: the change of the target, in its spreads, for one spread of this. */
    beta: number;
    p: number;
  }[];
}

export interface Correlations {
  from: LocalDate;
  to: LocalDate;
  metrics: CorrelationMetric[];
  /** Every pair compared, the strongest first. */
  correlations: Correlation[];
  /** For `target` of the query; `null` — too few days, or no such number. */
  regression: CorrelationRegression | null;
}

export const correlationsQuerySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  /** The number the regression explains; the mood when not given. */
  target: z.string().max(120).optional(),
});
export type CorrelationsQuery = z.infer<typeof correlationsQuerySchema>;

// --- Before and after an event of a life (Life → Links) ---

/** The windows "before and after" compare, in weeks. */
export const BEFORE_AFTER_WEEKS = [2, 4, 8] as const;

/** A date things may have changed at: the start or the end of a period (a diagnosis, a drug). */
export interface BeforeAfterEvent {
  /** Stable for the page's choice: the source, the kind, the title, the date and the edge. */
  id: string;
  module: string;
  /** `medication`, `diagnosis`. */
  kind: string;
  title: string;
  subtitle: string | null;
  on: LocalDate;
  /** The period began on that day, or ended. */
  edge: 'start' | 'end';
}

/** One daily number around an event: the windows before and after it compared. */
export interface BeforeAfterChange {
  key: string;
  module: string;
  labelKey: string;
  label?: string;
  unit: DailyMetric['unit'];
  currency?: string;
  /** The averages of the windows, and the days with a value in each. */
  before: number;
  after: number;
  daysBefore: number;
  daysAfter: number;
  /** `after` − `before`, in the number's own unit. */
  difference: number;
  /** Of a quantity, against `before`; `null` for a reading or a `before` of zero. */
  differencePercent: number | null;
  /**
   * The chance of a change this large by itself: measured in the spread of the changes at the
   * ordinary dates of the history (a placebo test), so the seasons, the trends and the days
   * that follow each other are in it. `null` — too little history to tell.
   */
  p: number | null;
  /** `p` corrected for the number of numbers compared (Benjamini–Hochberg). */
  q: number | null;
  /** Changed beyond what ordinary weeks do. */
  changed: boolean;
  /** The values of the windows, for the chart around the date. */
  values: { day: LocalDate; value: number }[];
}

export interface BeforeAfterResult {
  event: BeforeAfterEvent;
  /** Calendar days after the event in its window so far (an event of last week has few). */
  daysAfter: number;
  /** Enough days after the event to compare; otherwise `changes` is empty. */
  enough: boolean;
  /** The changed numbers first, then by `p`. */
  changes: BeforeAfterChange[];
}

export interface BeforeAfter {
  weeks: number;
  results: BeforeAfterResult[];
}

export const beforeAfterQuerySchema = z.object({
  weeks: z.coerce
    .number()
    .int()
    .refine((value) => (BEFORE_AFTER_WEEKS as readonly number[]).includes(value))
    .default(4),
});
export type BeforeAfterQuery = z.infer<typeof beforeAfterQuerySchema>;

// --- People ---

/** Something a section keeps about a person: a gift idea of the wishlist. */
export interface PersonNote {
  module: string;
  /** `gift` */
  kind: string;
  title: string;
  /** A line under it: the price. */
  detail: string | null;
  /** Where it is, inside the app or outside. */
  link: string | null;
}

// --- What was going on at a moment ---

/** Something that happened at a moment, for a section that asks "what else was then?". */
export interface Moment {
  module: string;
  /** `play`, `outage`. */
  kind: string;
  at: string;
  /** When it ended, for something that lasts (an outage). */
  until?: string;
  title: string;
  subtitle: string | null;
}

/**
 * Something that lasted, told by a section for the others: a medication taken, a condition
 * diagnosed (Health) — Psychology lays them over the mood. `to` `null` — still going on.
 */
export interface TimelinePeriod {
  module: string;
  /** `medication`, `diagnosis`. */
  kind: string;
  title: string;
  subtitle: string | null;
  from: LocalDate;
  to: LocalDate | null;
  /**
   * A treatment of the mind (a psychiatrist's medication, an ICD chapter F condition):
   * Psychology lays only those over the mood. Not set — not a period of treatment.
   */
  mind?: boolean;
}
