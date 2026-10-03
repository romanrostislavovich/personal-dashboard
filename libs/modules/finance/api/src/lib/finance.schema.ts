import { projects, users } from '@pd/api-core/schema';
import { COST_PROVIDERS, RECURRING_PERIODS, TRANSACTION_KINDS } from '@pd/contracts';
import {
  boolean,
  customType,
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
export const recurringPeriod = pgEnum('finance_recurring_period', RECURRING_PERIODS);

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
  period: recurringPeriod().notNull().default('month'),
  /** 1–12: the month of a yearly charge. */
  monthOfYear: smallint(),
  trialEndsOn: date({ mode: 'string' }),
  /** The trial end the reminder was sent for: once per date. */
  trialNotifiedFor: date({ mode: 'string' }),
  /** A higher price seen in the transactions and reported: once per price. */
  noticedAmount: numeric({ precision: 14, scale: 2, mode: 'number' }),
  isActive: boolean().notNull().default(true),
  lastChargedOn: date({ mode: 'string' }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** The earlier prices of a recurring payment: a row each time its amount changes. */
export const recurringPrices = pgTable('finance_recurring_prices', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  recurringPaymentId: uuid()
    .notNull()
    .references(() => recurringPayments.id, { onDelete: 'cascade' }),
  /** The price before the change. */
  amount: numeric({ precision: 14, scale: 2, mode: 'number' }).notNull(),
  changedOn: date({ mode: 'string' }).notNull(),
});

/** Repeating charges the user said are not subscriptions (by their lower-case note). */
export const subscriptionDismissals = pgTable(
  'finance_subscription_dismissals',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text().notNull(),
  },
  (table) => [unique().on(table.userId, table.key)],
);

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

/** Finance settings of a user. */
export const financeSettings = pgTable('finance_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Totals are converted into it; `null` — the currency used most. */
  mainCurrency: text(),
});

/** Binary data (PostgreSQL `bytea`) as a Node.js Buffer. */
const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

/** The photo of a receipt a transaction was recorded from (sent to the Telegram bot). */
export const financeReceipts = pgTable('finance_receipts', {
  /** One receipt per transaction; it goes with the transaction. */
  transactionId: uuid()
    .primaryKey()
    .references(() => transactions.id, { onDelete: 'cascade' }),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  data: bytea().notNull(),
  mimeType: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** A monthly limit of a category (`*` — all expenses), in the main currency. */
export const financeBudgets = pgTable(
  'finance_budgets',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: text().notNull(),
    limit: numeric({ precision: 14, scale: 2, mode: 'number' }).notNull(),
    /** The months (`YYYY-MM`) the 80% and the 100% of the limit were reported: once a month. */
    warnedMonth: text(),
    exceededMonth: text(),
  },
  (table) => [unique().on(table.userId, table.category)],
);

/** Saving up for something: a target, maybe a date, and where the money comes from. */
export const savingsGoals = pgTable('finance_goals', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  target: numeric({ precision: 14, scale: 2, mode: 'number' }).notNull(),
  currency: text().notNull(),
  deadline: date({ mode: 'string' }),
  /** `personal`, a project id, or `null` — only what is added by hand. */
  wallet: text(),
  startedOn: date({ mode: 'string' }).notNull(),
  /** When the target was reached and reported. */
  reachedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Money added to a goal (or taken out) by hand, in the goal's currency. */
export const goalContributions = pgTable('finance_goal_contributions', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  goalId: uuid()
    .notNull()
    .references(() => savingsGoals.id, { onDelete: 'cascade' }),
  amount: numeric({ precision: 14, scale: 2, mode: 'number' }).notNull(),
  note: text(),
  occurredOn: date({ mode: 'string' }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** The AI's report of a month: kept, so it is written once and can be read again. */
export const financeReports = pgTable(
  'finance_reports',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    month: text().notNull(),
    summary: text().notNull(),
    text: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.month)],
);

export type TransactionRow = typeof transactions.$inferSelect;
export type RecurringPaymentRow = typeof recurringPayments.$inferSelect;
export type CostSourceRow = typeof costSources.$inferSelect;
export type SavingsGoalRow = typeof savingsGoals.$inferSelect;
