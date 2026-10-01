import { z } from 'zod';
import { LocalDate } from './local-date';

export const wakatimeKeyInputSchema = z.object({
  /** The secret API key from wakatime.com/settings/account (`waka_…`). */
  apiKey: z.string().trim().min(10).max(200),
});
export type WakatimeKeyInput = z.infer<typeof wakatimeKeyInputSchema>;

/** What a day of coding is split by; everything WakaTime sends is saved. */
export const WAKATIME_BREAKDOWNS = [
  'project',
  'language',
  'editor',
  'os',
  'category',
  'machine',
] as const;
export type WakatimeBreakdown = (typeof WAKATIME_BREAKDOWNS)[number];

/** Periods of the statistics, in days. */
export const WAKATIME_PERIODS = [7, 30, 365] as const;
export type WakatimePeriod = (typeof WAKATIME_PERIODS)[number];

export interface WakatimeSettings {
  connected: boolean;
  username: string | null;
  lastSyncedAt: string | null;
  /** Text of the last sync error (for example, the key was revoked). */
  syncError: string | null;
}

export interface WakatimeDay {
  day: LocalDate;
  seconds: number;
}

/** A project, a language or an editor with the time spent in it. */
export interface WakatimeShare {
  name: string;
  seconds: number;
}

/** Coding time over a period, from the days saved in the dashboard. */
export interface WakatimeStats {
  /** Every day of the period, oldest first, days without coding as zeros. */
  days: WakatimeDay[];
  todaySeconds: number;
  totalSeconds: number;
  /** Days with any coding. */
  activeDays: number;
  /** Over the active days: a weekend off does not lower it. */
  dailyAverageSeconds: number;
  bestDay: WakatimeDay | null;
  projects: WakatimeShare[];
  languages: WakatimeShare[];
  editors: WakatimeShare[];
  operatingSystems: WakatimeShare[];
  /** Everything saved so far; `since` is the first saved day. */
  allTime: { seconds: number; since: LocalDate | null };
}
