import {z} from 'zod';
import {LocalDate} from './local-date';

/*
 * Hours, not only days (Links v2, stage 3): what the sections know hour by hour, the day's
 * rhythm, the hour after an event and the productive window (docs/proposals/links-v2.md).
 */

/** A local hour of the user's own day: `2026-11-07T14` — from 14:00 to 15:00. */
export type LocalHour = string;

/** A number a section has for every hour: minutes of coding, unlocks, steps. */
export interface HourlyMetric {
  /** `development.hour.coding`: stable, the section's id first. */
  key: string;
  module: string;
  labelKey: string;
  /** `minutes` of the hour (0–60), a `count`, or a `score` (a reading: the band's stress). */
  unit: 'minutes' | 'count' | 'score';
  /** Counted in the productive window (coding, deep work, tasks done). */
  productive?: true;
  /** The hours with a value; another hour of `days` is a zero, unless the number is a score. */
  hours: {hour: LocalHour; value: number}[];
  /** The days the section saw anything at all: an hour outside them is unknown. */
  days: LocalDate[];
}

/** Something that happened at an hour: a burst of notifications, a game, a walk. */
export interface HourEvent {
  /** `activity.event.game`. */
  key: string;
  module: string;
  labelKey: string;
  /** The hour of each time it happened (one hour once, however many times in it). */
  hours: LocalHour[];
  /** The days the section could have seen it: the hours of other days are not compared. */
  days: LocalDate[];
  /** The hourly numbers that are the event itself (the minutes of games): not compared with it. */
  itself?: string[];
}

/** An hourly number, as the lists show it. */
export interface HourlyInfo {
  key: string;
  module: string;
  labelKey: string;
  unit: HourlyMetric['unit'];
  productive?: true;
}

/** The periods the rhythm can be read over, days. */
export const RHYTHM_DAYS = [30, 90, 365] as const;
export type RhythmDays = (typeof RHYTHM_DAYS)[number];

/** A number by weekday and hour, over the days it was seen. */
export interface HourRhythm {
  key: string;
  /** The days it was seen. */
  days: number;
  /** `cells[weekday][hour]`: the mean of that hour; weekday 0 is Monday; `null` — never seen. */
  cells: (number | null)[][];
  /** Its usual day hour by hour (the mean over every day seen). */
  profile: (number | null)[];
  /** The hours it is highest at, as `[from, to)` hours, the highest first (two at most). */
  peaks: {from: number; to: number}[];
}

/** `GET /api/life/rhythm`. */
export interface LinksRhythm {
  from: LocalDate;
  to: LocalDate;
  metrics: HourlyInfo[];
  /** Of the number asked, or of the first; `null` — no hourly number at all. */
  rhythm: HourRhythm | null;
}

export const rhythmQuerySchema = z.object({
  key: z.string().max(120).optional(),
  days: z.coerce
    .number()
    .int()
    .refine(value => (RHYTHM_DAYS as readonly number[]).includes(value))
    .default(90),
});
export type RhythmQuery = z.infer<typeof rhythmQuerySchema>;

/** One number in the hour after an event against the same hours without it. */
export interface HourAfter {
  event: string;
  outcome: string;
  /** How many times the event came with the outcome known in the hour after. */
  events: number;
  /** The outcome's mean in the hours after the event … */
  after: number;
  /** … and in the same weekday's same hours without it. */
  usual: number;
  difference: number;
  /** The chance alone gives a difference this large, corrected for the number of pairs. */
  q: number;
  /** Large enough and sure enough to tell. */
  strong: boolean;
}

/** `GET /api/life/hour-after`: every event with every hourly number, the strong ones first. */
export interface LinksHourAfter {
  from: LocalDate;
  to: LocalDate;
  events: (Omit<HourEvent, 'hours' | 'days' | 'itself'> & {count: number})[];
  outcomes: HourlyInfo[];
  results: HourAfter[];
}

/** The hours the work goes best, of one weekday (0 — Monday). */
export interface ProductiveWindow {
  weekday: number;
  /** `[from, to)` hours, in the order of the day; empty — no window stands out. */
  windows: {from: number; to: number}[];
  /** The weekdays of it seen with any productive number. */
  days: number;
  /** How sure: `low` — few days or a flat day; `high` — many days and a clear window. */
  sure: 'low' | 'medium' | 'high';
}

/** `GET /api/life/window`: today's window and the week's, over the last 90 days. */
export interface LinksWindow {
  today: LocalDate;
  weekday: number;
  week: ProductiveWindow[];
  /** The numbers it is made of. */
  metrics: HourlyInfo[];
}
