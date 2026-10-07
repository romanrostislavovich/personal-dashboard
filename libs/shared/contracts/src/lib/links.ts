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
  /** `clock` — a time of the day in hours (23.5 — half past eleven; over 24 — after midnight). */
  unit: 'hours' | 'money' | 'count' | 'score' | 'degrees' | 'clock';
  currency?: string;
  days: { day: LocalDate; value: number }[];
}

/** How a number differs between the days of a good mood and of a bad one. */
export interface MoodInsight {
  key: string;
  module: string;
  labelKey: string;
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
