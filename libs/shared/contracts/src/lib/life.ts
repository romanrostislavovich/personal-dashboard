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
