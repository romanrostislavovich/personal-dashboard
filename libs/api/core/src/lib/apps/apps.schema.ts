import {AppKind} from '@pd/contracts';
import {index, pgTable, text, timestamp, uuid} from 'drizzle-orm/pg-core';
import {users} from '../users/users.schema';

/**
 * A device that runs one of the apps (the desktop app, the browser extension), as it last told
 * the server. The id is made by the app itself and kept on the device, so a device is one row
 * however often it reports — and on both instances of a sync alike.
 */
export const appInstalls = pgTable(
  'app_installs',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    kind: text().$type<AppKind>().notNull(),
    name: text().notNull(),
    platform: text().notNull(),
    version: text().notNull(),
    lastSeenAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [index().on(table.userId)],
);

export type AppInstallRow = typeof appInstalls.$inferSelect;
