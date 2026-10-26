import { users } from '@pd/api-core/schema';
import { PhoneSecurity } from '@pd/contracts';
import { jsonb, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { activityDevices } from '../activity.schema';

/**
 * The last security report of each phone (Security → Phone): the phone sends one a day, and only
 * the latest is kept — the security agent compares it with what it saw before through its
 * findings, not through the reports.
 */
export const activityPhoneSecurity = pgTable(
  'activity_phone_security',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid()
      .notNull()
      .references(() => activityDevices.id, { onDelete: 'cascade' }),
    at: timestamp({ withTimezone: true }).notNull(),
    report: jsonb().$type<PhoneSecurity>().notNull(),
  },
  (table) => [unique().on(table.deviceId)],
);
