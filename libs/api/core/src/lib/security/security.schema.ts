import { FindingOrigin, FindingStatus, SecurityArea, SecuritySeverity } from '@pd/contracts';
import { boolean, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { authSchema } from '../auth/auth.schema';
import { users } from '../users/users.schema';

/**
 * Every attempt to sign in to this instance, good or bad. Like the sessions it lives in the
 * unsynced `auth` schema: the server and a local copy each have their own visitors.
 */
export const signIns = authSchema.table(
  'sign_ins',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** The account it was an attempt at; `null` — an email nobody has. */
    userId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    email: text().notNull(),
    /** `ok`, `wrong-password` or `wrong-code`. */
    outcome: text().notNull(),
    ip: text(),
    userAgent: text(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.at)],
);

/**
 * What the security agent found. A finding has a stable `key` (`host.firewall-off`): seen again
 * it is the same row, gone — the row is marked resolved. Kept in `public`, so a local copy shows
 * what the server found.
 */
export const securityFindings = pgTable(
  'security_findings',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** The owner of the instance: the agent reports to them. */
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text().notNull(),
    area: text().$type<SecurityArea>().notNull(),
    severity: text().$type<SecuritySeverity>().notNull(),
    title: text().notNull(),
    details: text().notNull(),
    fix: text().notNull(),
    /** The AI's step-by-step guide, written on request. */
    guide: text(),
    guideAt: timestamp({ withTimezone: true }),
    origin: text().$type<FindingOrigin>().notNull(),
    /** An AI finding: the keys of the rules' findings it is about (see finding-coverage.ts). */
    covers: text().array().notNull().default([]),
    status: text().$type<FindingStatus>().notNull().default('open'),
    firstSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp({ withTimezone: true }),
  },
  (table) => [unique().on(table.userId, table.key)],
);

/** The AI's accounts of its investigations; the last ones are kept. */
export const securityReports = pgTable('security_reports', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  text: text().notNull(),
  model: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const securitySettings = pgTable('security_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  aiEnabled: boolean().notNull().default(true),
  /** The agent's own AI connection; `null` — the assistant's. */
  connectionId: uuid(),
  scannedAt: timestamp({ withTimezone: true }),
  /** Areas that had something to look at in the last scan. */
  areas: text().array().$type<SecurityArea[]>().notNull().default([]),
});

export type SecurityFindingRow = typeof securityFindings.$inferSelect;
export type SignInRow = typeof signIns.$inferSelect;
