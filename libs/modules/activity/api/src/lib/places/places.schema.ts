import { encryptedText, registerEncryptedTables, users } from '@pd/api-core/schema';
import { index, integer, pgTable, real, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { activityDevices } from '../activity.schema';

/**
 * Where the phone was (the Android app takes a low-power fix every 15 minutes once the location
 * is allowed). The point is stored encrypted, like the diary: `"52.2297,21.0122"` — where
 * someone lives and goes is among the most private things the dashboard keeps.
 */
export const activityPhoneLocations = pgTable(
  'activity_phone_locations',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid()
      .notNull()
      .references(() => activityDevices.id, { onDelete: 'cascade' }),
    at: timestamp({ withTimezone: true }).notNull(),
    point: encryptedText().notNull(),
    /** Meters, as Android estimated it. */
    accuracy: real().notNull(),
  },
  (table) => [
    // A batch sent twice (the answer was lost) is written once.
    unique().on(table.deviceId, table.at),
    index().on(table.userId, table.at),
  ],
);

/** A place the user named ("Home", "Work"): the stays within its radius take the name. */
export const activityPlaces = pgTable('activity_places', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  /** Encrypted like the fixes: `"52.2297,21.0122"`. */
  point: encryptedText().notNull(),
  radiusM: integer().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

registerEncryptedTables(activityPhoneLocations, activityPlaces);
