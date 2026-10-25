import { z } from 'zod';
import { LocalDate } from './local-date';

// How the phone is used (the Android app, stage 2 of docs/proposals/mobile-app.md): how often it
// is picked up, and how long it is looked at late at night.

const moment = z.iso.datetime({ offset: true });
const LOCAL_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The moments the phone was unlocked, as Android tells them. */
export const phoneUnlockIngestSchema = z.object({
  unlocks: z.array(moment).max(500),
});
export type PhoneUnlockIngest = z.infer<typeof phoneUnlockIngestSchema>;

export const phoneUsageQuerySchema = z.object({ from: LOCAL_DATE, to: LOCAL_DATE });
export type PhoneUsageQuery = z.infer<typeof phoneUsageQuerySchema>;

/**
 * A day of the phone. A night belongs to the evening it began on (23:00–04:00, like late games):
 * the use after midnight counts to the day before.
 */
export interface PhoneUsageDay {
  day: LocalDate;
  unlocks: number;
  /** In apps of the phone from 23:00 to 04:00. */
  nightSeconds: number;
}

/** Activity → Phone: unlocks and the night, day by day. */
export interface PhoneUsage {
  /** Only the days with something. */
  days: PhoneUsageDay[];
  unlocks: number;
  nightSeconds: number;
  /** The hour of the day (0–23) of each unlock, summed over the period. */
  unlocksByHour: number[];
}
