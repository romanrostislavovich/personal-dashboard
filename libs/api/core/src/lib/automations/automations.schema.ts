import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../users/users.schema';

/** Rules "if X, then Y": a trigger of one module and an action of another, with their fields. */
export const automationRules = pgTable('automation_rules', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  trigger: text().notNull(),
  triggerParams: jsonb().$type<Record<string, string>>().notNull().default({}),
  action: text().notNull(),
  actionParams: jsonb().$type<Record<string, string>>().notNull().default({}),
  isActive: boolean().notNull().default(true),
  fireCount: integer().notNull().default(0),
  lastFiredAt: timestamp({ withTimezone: true }),
  /** The user's day of the last run and how many runs it had: a rule cannot run away. */
  lastFiredOn: date({ mode: 'string' }),
  firedThatDay: smallint().notNull().default(0),
  lastError: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type AutomationRuleRow = typeof automationRules.$inferSelect;
