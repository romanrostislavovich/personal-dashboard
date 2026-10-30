import {
  encryptedText,
  registerEncryptedTables,
  users,
} from '@pd/api-core/schema';
import {
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import {activityDevices} from './activity.schema';

/**
 * A notification another app showed on the user's phone (the Android app writes them down once
 * allowed): which app, when, and its title and text — stored encrypted, like the diary. What
 * interrupts and how often, next to the time in apps (Activity → Phone).
 */
export const activityPhoneNotifications = pgTable(
  'activity_phone_notifications',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    deviceId: uuid()
      .notNull()
      .references(() => activityDevices.id, {onDelete: 'cascade'}),
    /** The package, as Android names the app: `com.instagram.android`. */
    app: text().notNull(),
    appName: text().notNull(),
    title: encryptedText().notNull(),
    text: encryptedText().notNull(),
    postedAt: timestamp({withTimezone: true}).notNull(),
  },
  table => [
    // A batch sent twice (the answer was lost) is written once.
    unique().on(table.deviceId, table.app, table.postedAt),
    index().on(table.userId, table.postedAt),
  ],
);

export type ActivityPhoneNotificationRow =
  typeof activityPhoneNotifications.$inferSelect;

registerEncryptedTables(activityPhoneNotifications);
