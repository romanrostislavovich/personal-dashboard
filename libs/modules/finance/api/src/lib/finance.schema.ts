import { projects, users } from '@pd/api-core/schema';
import { COST_PROVIDERS, TRANSACTION_KINDS } from '@pd/contracts';
import {
  boolean,
  date,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const transactionKind = pgEnum('finance_transaction_kind', TRANSACTION_KINDS);

/**
 * Recurring payments: servers, domains, subscriptions.
 * Once a month they turn into transactions (see RecurringPaymentsJob).
 */
export const recurringPayments = pgTable('finance_recurring_payments', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // restrict: a project cannot be deleted while it has financial records.
  projectId: uuid().references(() => projects.id, { onDelete: 'restrict' }),
  name: text().notNull(),
  amount: numeric({ precision: 14, scale: 2, mode: 'number' }).notNull(),
  currency: text().notNull(),
  category: text().notNull(),
  dayOfMonth: smallint().notNull(),
  isActive: boolean().notNull().default(true),
  lastChargedOn: date({ mode: 'string' }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const costProvider = pgEnum('finance_cost_provider', COST_PROVIDERS);

/**
 * Sources of automatic cost import (Hetzner, DeepSeek…). The API token is stored
 * in the core SecretsService under the key `finance.cost-source.<id>`.
 */
export const costSources = pgTable('finance_cost_sources', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid().references(() => projects.id, { onDelete: 'restrict' }),
  provider: costProvider().notNull(),
  name: text().notNull(),
  category: text().notNull(),
  /** Provider data between syncs (for example, the previous DeepSeek balance). */
  state: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  lastSyncedAt: timestamp({ withTimezone: true }),
  lastError: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Income and expenses. Without projectId — personal, with projectId — the project's. */
export const transactions = pgTable(
  'finance_transactions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid().references(() => projects.id, { onDelete: 'restrict' }),
    recurringPaymentId: uuid().references(() => recurringPayments.id, { onDelete: 'set null' }),
    costSourceId: uuid().references(() => costSources.id, { onDelete: 'set null' }),
    /** Month `YYYY-MM` for which the amount was imported from a cost source. */
    costPeriod: text(),
    kind: transactionKind().notNull(),
    amount: numeric({ precision: 14, scale: 2, mode: 'number' }).notNull(),
    currency: text().notNull(),
    category: text().notNull(),
    note: text(),
    occurredOn: date({ mode: 'string' }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  // One transaction per source and month — the sync updates it instead of creating new ones.
  (table) => [unique().on(table.costSourceId, table.costPeriod)],
);

export type TransactionRow = typeof transactions.$inferSelect;
export type RecurringPaymentRow = typeof recurringPayments.$inferSelect;
export type CostSourceRow = typeof costSources.$inferSelect;
