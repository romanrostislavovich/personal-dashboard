import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../users/users.schema';

/**
 * A phone that gets push notifications (the Android app): the token Firebase gave the app.
 * The id is the app's own (`installId`, the same as in Settings → Apps), so a phone is one row
 * however often its token changes.
 */
export const pushDevices = pgTable(
  'push_devices',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text().notNull(),
    name: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSentAt: timestamp({ withTimezone: true }),
  },
  (table) => [index().on(table.userId)],
);

export type PushDeviceRow = typeof pushDevices.$inferSelect;
