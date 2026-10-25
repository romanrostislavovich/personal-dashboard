import { encryptedText, registerEncryptedTables, users } from '@pd/api-core/schema';
import {
  date,
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { activityDevices } from '../activity.schema';

/**
 * A signal of the phone (docs/telemetry.md, the phone's collectors 1–10): the screen on and off,
 * charging, Wi-Fi, Bluetooth, what plays, Do Not Disturb, the ringer, a call, a photo, the
 * noise, the light. What it tells (a network's name, a call's length, a track) is encrypted.
 */
export const activityPhoneSignals = pgTable(
  'activity_phone_signals',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid()
      .notNull()
      .references(() => activityDevices.id, { onDelete: 'cascade' }),
    kind: text().notNull(),
    at: timestamp({ withTimezone: true }).notNull(),
    /** JSON of what the signal tells; `null` — nothing beyond the moment (the screen on). */
    data: encryptedText(),
  },
  (table) => [
    // A batch sent twice (the answer was lost) is written once.
    unique().on(table.deviceId, table.kind, table.at),
    index().on(table.userId, table.at),
  ],
);

/** A number of a day the phone counts itself: steps, the mobile data of an app, Wi-Fi in all. */
export const activityPhoneDaily = pgTable(
  'activity_phone_daily',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid()
      .notNull()
      .references(() => activityDevices.id, { onDelete: 'cascade' }),
    /** The phone's own day. */
    day: date().notNull(),
    kind: text().notNull(),
    /** The app of mobile data; '' for one number a day. */
    key: text().notNull().default(''),
    value: doublePrecision().notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.deviceId, table.day, table.kind, table.key),
    index().on(table.userId, table.day),
  ],
);

registerEncryptedTables(activityPhoneSignals);
