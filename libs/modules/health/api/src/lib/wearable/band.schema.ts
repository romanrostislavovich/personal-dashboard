import { users } from '@pd/api-core/schema';
import type { BandPointKind, BandSessionKind, ReactionFeeling, SleepStage } from '@pd/contracts';
import {
  date,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * The band in detail, from the phone's Health Connect (docs/telemetry.md, "The band"): the phone
 * sends a time window, and the server replaces what it had inside it. What the server counts
 * from it (stress, reactions, the days) is kept beside it.
 */

const userId = () =>
  uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });
const moment = () => timestamp({ withTimezone: true }).notNull();

/** The pulse and the steps of a minute; a minute the band did not tell is not there. */
export const healthBandMinutes = pgTable(
  'health_band_minutes',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: userId(),
    at: moment(),
    bpm: doublePrecision(),
    bpmMin: integer(),
    bpmMax: integer(),
    steps: integer(),
  },
  (table) => [unique().on(table.userId, table.at)],
);

/** An hour's activity (Health Connect's own sums, other apps' duplicates removed). */
export const healthBandHours = pgTable(
  'health_band_hours',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: userId(),
    at: moment(),
    steps: integer(),
    calories: doublePrecision(),
    distanceM: doublePrecision(),
    floors: doublePrecision(),
  },
  (table) => [unique().on(table.userId, table.at)],
);

/** A reading at a moment: HRV (RMSSD, ms), skin temperature (°C against the band's baseline)… */
export const healthBandPoints = pgTable(
  'health_band_points',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: userId(),
    kind: text().$type<BandPointKind>().notNull(),
    at: moment(),
    value: doublePrecision().notNull(),
  },
  (table) => [unique().on(table.userId, table.kind, table.at)],
);

/** A sleep with its stages, an exercise, a mindfulness session. */
export const healthBandSessions = pgTable(
  'health_band_sessions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: userId(),
    kind: text().$type<BandSessionKind>().notNull(),
    startAt: moment(),
    endAt: moment(),
    /** Health Connect's exercise type. */
    type: integer(),
    title: text(),
    stages: jsonb()
      .$type<{ startAt: string; endAt: string; stage: SleepStage }[]>()
      .notNull()
      .default([]),
    /** `phone` — Health Connect (replaced by the next window); `dashboard` — made here. */
    source: text().$type<'phone' | 'dashboard'>().notNull().default('phone'),
  },
  (table) => [unique().on(table.userId, table.kind, table.startAt)],
);

/** The stress index of an hour, counted from its minutes at rest. */
export const healthBandStressHours = pgTable(
  'health_band_stress_hours',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: userId(),
    at: moment(),
    score: integer().notNull(),
    restMinutes: integer().notNull(),
  },
  (table) => [unique().on(table.userId, table.at)],
);

/** A reaction of the body: the pulse well above the owner's own at rest, without moving. */
export const healthBandReactions = pgTable(
  'health_band_reactions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: userId(),
    startAt: moment(),
    endAt: moment(),
    peakBpm: integer().notNull(),
    baselineBpm: integer().notNull(),
    score: integer().notNull(),
    /** What the owner said it was (the notification's buttons). */
    feeling: text().$type<ReactionFeeling>(),
    notifiedAt: timestamp({ withTimezone: true }),
  },
  (table) => [unique().on(table.userId, table.startAt)],
);

/**
 * A day as the phone's data tells it, in the owner's time zone, with what is counted from it.
 * Health → Band shows the Google Health API's day (`health_wearable_days`) first and fills the
 * gaps from here.
 */
export const healthBandDays = pgTable(
  'health_band_days',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: userId(),
    day: date({ mode: 'string' }).notNull(),
    steps: integer(),
    calories: integer(),
    distanceKm: doublePrecision(),
    heartRateAvg: integer(),
    heartRateMax: integer(),
    restingHeartRate: integer(),
    /** The pulse at rest while awake (the median of the day's minutes at rest): the stress index's baseline. */
    restBpm: integer(),
    hrvMs: doublePrecision(),
    sleepMinutes: integer(),
    deepMinutes: integer(),
    remMinutes: integer(),
    lightMinutes: integer(),
    awakeMinutes: integer(),
    sleepStart: text(),
    sleepEnd: text(),
    sleepScore: integer(),
    stressScore: integer(),
    resilience: integer(),
    reactions: integer(),
    mindfulnessMinutes: integer(),
    skinTempDelta: doublePrecision(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique().on(table.userId, table.day)],
);
