import { users } from '@pd/api-core/schema';
import {
  date,
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * A day of the band, read from the Google Health API (docs/telemetry.md). Every number may be
 * `null`: the band did not tell it that day (not worn, no sleep tracked), which is not a zero.
 * Written again while Google still adds to the day, so a row is replaced, never appended.
 */
export const healthWearableDays = pgTable(
  'health_wearable_days',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date({ mode: 'string' }).notNull(),
    steps: integer(),
    calories: integer(),
    distanceKm: doublePrecision(),
    activeZoneMinutes: integer(),
    heartRateAvg: integer(),
    heartRateMax: integer(),
    restingHeartRate: integer(),
    hrvMs: doublePrecision(),
    spo2: doublePrecision(),
    sleepMinutes: integer(),
    deepMinutes: integer(),
    remMinutes: integer(),
    lightMinutes: integer(),
    awakeMinutes: integer(),
    /** HH:MM of the band's local time. */
    sleepStart: text(),
    sleepEnd: text(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique().on(table.userId, table.day)],
);

/** The state of a user's Google Health connection (the refresh token is in the secrets). */
export const healthWearableAccounts = pgTable('health_wearable_accounts', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  lastSyncedAt: timestamp({ withTimezone: true }),
  lastError: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
