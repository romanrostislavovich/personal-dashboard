import {users} from '@pd/api-core/schema';
import {boolean, jsonb, pgTable, timestamp, uuid} from 'drizzle-orm/pg-core';
import {activityDevices} from '../activity.schema';

/** What the watchdog watches on a phone: its background collection, the band, the places. */
export type PhoneStream = 'collection' | 'band' | 'places';

/**
 * How the phone's collection is doing (see PhoneWatchdogService): the phone's word after each
 * run, and what the watchdog did about a silence.
 */
export const activityPhoneCollection = pgTable('activity_phone_collection', {
  deviceId: uuid()
    .primaryKey()
    .references(() => activityDevices.id, {onDelete: 'cascade'}),
  userId: uuid()
    .notNull()
    .references(() => users.id, {onDelete: 'cascade'}),
  /** The last run of the background collection. */
  collectedAt: timestamp({withTimezone: true}).notNull(),
  healthAllowed: boolean().notNull(),
  /** The end of the newest Health Connect record the phone has seen. */
  healthNewestAt: timestamp({withTimezone: true}),
  locationAllowed: boolean().notNull(),
  /** The last silent push that woke the phone. */
  revivedAt: timestamp({withTimezone: true}),
  /**
   * The silences told to the owner: a stream and the moment its data stopped. A silence is told
   * once; data again, and a later one is told anew.
   */
  told: jsonb()
    .$type<Partial<Record<PhoneStream, string>>>()
    .notNull()
    .default({}),
});
