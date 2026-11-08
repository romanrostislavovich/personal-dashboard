import {z} from 'zod';
import {DailyMetric} from './links';
import {LocalDate} from './local-date';

/*
 * The overload warning and the habit lapse risk (Links v2, stage 5): the last days against the
 * user's own usual, and tomorrow's chance a habit lapses (docs/proposals/links-v2.md).
 */

/** A number of the overload score: lately against usually, and how much heavier. */
export interface OverloadPart {
  key: string;
  module: string;
  labelKey: string;
  label?: string;
  unit: DailyMetric['unit'];
  recent: number;
  usual: number;
  /** In the usual spread: positive — heavier than usual. */
  weight: number;
}

/** `GET /api/life/overload`: the score of the last days that are over, and its history. */
export interface LinksOverload {
  /** The last day of "lately" (yesterday: today is not over). */
  day: LocalDate;
  /** `null` — fewer than three of its numbers known lately. */
  score: number | null;
  /** The user's own high; `null` — not enough days to know it yet. */
  threshold: number | null;
  high: boolean;
  /** Heaviest first. */
  parts: OverloadPart[];
  /** The last 60 days' scores, the oldest first. */
  history: {day: LocalDate; score: number}[];
  /** Whether the warning is sent (Telegram, the phone, the computer). */
  enabled: boolean;
  lastWarned: LocalDate | null;
}

export const overloadSettingsSchema = z.object({enabled: z.boolean()});
export type OverloadSettings = z.infer<typeof overloadSettingsSchema>;

/** Tomorrow's chance of a habit lapsing, by a model of the user's own days. */
export interface HabitLapse {
  key: string;
  labelKey: string;
  label?: string;
  /** 0–1; `null` — not enough days or lapses to learn from. */
  chance: number | null;
  /** How often it lapses, on the days learnt from. */
  usual: number | null;
  days: number;
  /** Beat "as often as usual" on the latest days. */
  trusted: boolean;
  /** Likely enough to tell in the evening. */
  high: boolean;
  /** What pushes it up most, with what each adds to the chance. */
  drivers: {key: string; labelKey: string; label?: string; effect: number}[];
}

/** `GET /api/life/lapses`: every habit with a lapse to tell, for tomorrow. */
export interface LinksLapses {
  /** The day the chances are of (tomorrow). */
  day: LocalDate;
  habits: HabitLapse[];
}
