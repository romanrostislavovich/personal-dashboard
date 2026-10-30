import {z} from 'zod';

/**
 * The band in detail, read by the phone from Health Connect (docs/proposals/mobile-app.md,
 * stage 3): the pulse per minute, HRV readings, sleep with its stages, exercises — and what the
 * server counts from them: the stress index, the body's reactions, the sleep score, resilience.
 * The day totals stay in `WearableDay` (health-wearable.ts), the Google Health API's first.
 */

/** A part of a night (Health Connect's stages, the ones a band tells). */
export const SLEEP_STAGES = [
  'awake',
  'light',
  'deep',
  'rem',
  'asleep',
  'out',
] as const;
export type SleepStage = (typeof SLEEP_STAGES)[number];

/** A reading at a moment. `restingHr`, `spo2` and `respiratoryRate` only when a band writes them. */
export const BAND_POINT_KINDS = [
  'hrv',
  'restingHr',
  'spo2',
  'skinTemp',
  'respiratoryRate',
] as const;
export type BandPointKind = (typeof BAND_POINT_KINDS)[number];

export const BAND_SESSION_KINDS = ['sleep', 'exercise', 'mindfulness'] as const;
export type BandSessionKind = (typeof BAND_SESSION_KINDS)[number];

/** How the stress index reads, 0–100: under 25 calm, under 60 normal, under 85 raised, then high. */
export const STRESS_LEVELS = ['calm', 'normal', 'raised', 'high'] as const;
export type StressLevel = (typeof STRESS_LEVELS)[number];

export function stressLevel(score: number): StressLevel {
  return score < 25
    ? 'calm'
    : score < 60
      ? 'normal'
      : score < 85
        ? 'raised'
        : 'high';
}

/** What the owner says a reaction of the body was (the notification's buttons). */
export const REACTION_FEELINGS = [
  'calm',
  'anxious',
  'irritated',
  'excited',
  'active',
  'other',
] as const;
export type ReactionFeeling = (typeof REACTION_FEELINGS)[number];

const at = z.iso.datetime({offset: true});
const bpm = z.number().min(20).max(250);

/**
 * What the phone sends (`POST /api/medical/band/device`, with its device token): everything of
 * Health Connect between `from` and `to` — the server replaces what it had there, so a window
 * sent again (the band synced late, a record was deleted) leaves no duplicates.
 */
export const bandIngestSchema = z
  .object({
    from: at,
    to: at,
    minutes: z
      .array(
        z.object({
          at,
          bpm: bpm.nullable(),
          bpmMin: bpm.nullable(),
          bpmMax: bpm.nullable(),
          steps: z.number().int().min(0).max(1000).nullable(),
        }),
      )
      .max(3000),
    hours: z
      .array(
        z.object({
          at,
          steps: z.number().int().min(0).max(100_000).nullable(),
          calories: z.number().min(0).max(10_000).nullable(),
          distanceM: z.number().min(0).max(200_000).nullable(),
          floors: z.number().min(0).max(1000).nullable(),
        }),
      )
      .max(60),
    points: z
      .array(
        z.object({
          kind: z.enum(BAND_POINT_KINDS),
          at,
          value: z.number().min(-50).max(500),
        }),
      )
      .max(3000),
    sessions: z
      .array(
        z.object({
          kind: z.enum(BAND_SESSION_KINDS),
          startAt: at,
          endAt: at,
          /** Health Connect's exercise type (ExerciseSessionRecord), for an exercise. */
          type: z.number().int().min(0).max(1000).nullable(),
          title: z.string().trim().max(200).nullable(),
          stages: z
            .array(
              z.object({startAt: at, endAt: at, stage: z.enum(SLEEP_STAGES)}),
            )
            .max(500),
        }),
      )
      .max(100),
  })
  .refine(body => Date.parse(body.to) > Date.parse(body.from), {
    message: 'to before from',
  })
  .refine(
    body => Date.parse(body.to) - Date.parse(body.from) <= 50 * 3600_000,
    {
      message: 'a window of at most two days',
    },
  );
export type BandIngest = z.infer<typeof bandIngestSchema>;

export const bandDayQuerySchema = z.object({day: z.iso.date()});
export type BandDayQuery = z.infer<typeof bandDayQuerySchema>;

export interface BandMinute {
  at: string;
  bpm: number | null;
  steps: number | null;
}

export interface BandHour {
  at: string;
  steps: number | null;
  calories: number | null;
  /** The stress index of the hour at rest; `null` — too few minutes at rest to tell. */
  stress: number | null;
}

export interface BandSleep {
  startAt: string;
  endAt: string;
  stages: {startAt: string; endAt: string; stage: SleepStage}[];
}

export interface BandSession {
  id: string;
  kind: BandSessionKind;
  startAt: string;
  endAt: string;
  type: number | null;
  title: string | null;
  /** `phone` — from Health Connect; `dashboard` — a breathing session started here. */
  source: 'phone' | 'dashboard';
}

/** A moment the pulse rose well above the owner's own at rest, without moving. */
export interface BandReaction {
  id: string;
  startAt: string;
  endAt: string;
  peakBpm: number;
  /** The resting pulse it was measured against. */
  baselineBpm: number;
  score: number;
  feeling: ReactionFeeling | null;
}

/** Health → Band, one day by hours and its night. */
export interface BandDayDetail {
  day: string;
  minutes: BandMinute[];
  hours: BandHour[];
  /** The night that ended this day. */
  sleep: BandSleep | null;
  exercises: BandSession[];
  mindfulness: BandSession[];
  reactions: BandReaction[];
  /** The points of the day and its night: HRV readings, skin temperature. */
  points: {kind: BandPointKind; at: string; value: number}[];
  /** The owner's 28-day baselines, for "against the norm". */
  baseline: {
    restingHeartRate: number | null;
    hrvMs: number | null;
    sleepMinutes: number | null;
  };
}

export const reactionFeelingSchema = z.object({
  feeling: z.enum(REACTION_FEELINGS),
});
export type ReactionFeelingInput = z.infer<typeof reactionFeelingSchema>;

/** A breathing session done in the dashboard (or told after it). */
export const mindfulnessInputSchema = z.object({
  startAt: at,
  minutes: z.number().int().min(1).max(180),
});
export type MindfulnessInput = z.infer<typeof mindfulnessInputSchema>;
