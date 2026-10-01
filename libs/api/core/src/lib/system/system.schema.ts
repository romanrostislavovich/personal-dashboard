import { SystemLogLevel } from '@pd/contracts';
import { bigserial, index, integer, pgSchema, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * How this instance itself is doing lives in its own schema, so it is neither synced
 * (docs/sync.md) nor kept in the trash: the server and a local copy each have their own log.
 */
export const systemSchema = pgSchema('system');

/** Errors and warnings of the server. A repeated one is the same row with a larger `count`. */
export const systemLog = systemSchema.table(
  'log',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    level: text().$type<SystemLogLevel>().notNull(),
    /** The logger's context: a service or a job. */
    source: text().notNull(),
    message: text().notNull(),
    /** The stack trace, if there was one. */
    details: text(),
    count: integer().notNull().default(1),
    firstAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.lastAt)],
);

/** The last runs of every background job. */
export const systemJobRuns = systemSchema.table('job_runs', {
  name: text().primaryKey(),
  cron: text().notNull(),
  lastStartedAt: timestamp({ withTimezone: true }),
  lastFinishedAt: timestamp({ withTimezone: true }),
  lastDurationMs: integer(),
  /** Failed runs in a row; 0 — the last run went well. */
  failures: integer().notNull().default(0),
  lastError: text(),
  lastErrorAt: timestamp({ withTimezone: true }),
});
