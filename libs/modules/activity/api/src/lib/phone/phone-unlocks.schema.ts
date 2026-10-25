import { users } from '@pd/api-core/schema';
import { index, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { activityDevices } from '../activity.schema';

/** A moment the phone was unlocked (the Android app reads it from Android's usage events). */
export const activityPhoneUnlocks = pgTable(
  'activity_phone_unlocks',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid()
      .notNull()
      .references(() => activityDevices.id, { onDelete: 'cascade' }),
    at: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [
    // A batch sent twice (the answer was lost) is written once.
    unique().on(table.deviceId, table.at),
    index().on(table.userId, table.at),
  ],
);
