import { projects, users } from '@pd/api-core/schema';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const monitorStatus = pgEnum('monitoring_status', ['up', 'down', 'pending']);

/** Checked addresses. A project may have several: site, API, admin panel. */
export const monitors = pgTable('monitoring_monitors', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Monitoring is part of a project: deleting the project deletes its monitors.
  projectId: uuid()
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  url: text().notNull(),

  status: monitorStatus().notNull().default('pending'),
  /** Consecutive failed checks — "down" is declared only after several. */
  consecutiveFailures: smallint().notNull().default(0),
  /** Time of the first failed check in the current series. */
  failingSince: timestamp({ withTimezone: true }),
  lastCheckedAt: timestamp({ withTimezone: true }),
  lastStatusCode: smallint(),
  lastResponseMs: integer(),
  lastError: text(),
  sslExpiresAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Check history — for the availability percentage and the response time chart. */
export const checkResults = pgTable(
  'monitoring_check_results',
  {
    id: uuid().primaryKey().defaultRandom(),
    monitorId: uuid()
      .notNull()
      .references(() => monitors.id, { onDelete: 'cascade' }),
    checkedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    isUp: boolean().notNull(),
    statusCode: smallint(),
    responseMs: integer(),
  },
  (table) => [index().on(table.monitorId, table.checkedAt)],
);

export type MonitorRow = typeof monitors.$inferSelect;
