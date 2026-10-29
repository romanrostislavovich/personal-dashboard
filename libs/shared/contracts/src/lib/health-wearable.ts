import { z } from 'zod';

/**
 * The band's data through the Google Health API (docs/proposals/mobile-app.md, stage 3): the
 * Fitbit Air and every Fitbit write there, and the dashboard reads it from the server — no
 * phone of ours in between.
 */

/** The keys of the Google Cloud app the owner makes (once for every user of the server). */
export const googleHealthAppInputSchema = z.object({
  clientId: z
    .string()
    .trim()
    .regex(/^[\w-]+\.apps\.googleusercontent\.com$/),
  clientSecret: z.string().trim().min(10).max(200),
});
export type GoogleHealthAppInput = z.infer<typeof googleHealthAppInputSchema>;

/** One day of the band; a number the band did not tell is `null`, never a zero. */
export interface WearableDay {
  /** YYYY-MM-DD, the band's own day. */
  day: string;
  steps: number | null;
  /** kcal of the whole day, the body's own included. */
  calories: number | null;
  distanceKm: number | null;
  /** Minutes in the fat-burn, cardio and peak heart rate zones together. */
  activeZoneMinutes: number | null;
  heartRateAvg: number | null;
  heartRateMax: number | null;
  restingHeartRate: number | null;
  /** Heart rate variability of the night, RMSSD in ms. */
  hrvMs: number | null;
  /** Oxygen saturation of the night, %. */
  spo2: number | null;
  /** The main sleep that ended this day. */
  sleepMinutes: number | null;
  deepMinutes: number | null;
  remMinutes: number | null;
  lightMinutes: number | null;
  awakeMinutes: number | null;
  /** HH:MM, local time of the band. */
  sleepStart: string | null;
  sleepEnd: string | null;
  /** Counted by the dashboard from the phone's Health Connect data (health-band.ts): */
  /** The night's sleep, 0–100: its length, deep and REM, how restful. */
  sleepScore: number | null;
  /** The stress index of the day, 0–100, against the owner's own baseline. */
  stressScore: number | null;
  /** The day's load (stress at rest) against the night's recovery, 0–100; higher is better. */
  resilience: number | null;
  /** How many times the body reacted (the pulse up without moving). */
  reactions: number | null;
  mindfulnessMinutes: number | null;
  /** The night's skin temperature against the band's own baseline, °C. */
  skinTempDelta: number | null;
}

export interface WearableStatus {
  /** The owner set the Google app's keys on the server. */
  available: boolean;
  connected: boolean;
  /** For the owner: which app it is and the redirect URI to put into it. */
  app: { clientId: string | null; redirectUri: string } | null;
  lastSyncedAt: string | null;
  error: string | null;
  /** The first day of the band in the dashboard. */
  firstDay: string | null;
}

export const wearableDaysQuerySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
});
export type WearableDaysQuery = z.infer<typeof wearableDaysQuerySchema>;
