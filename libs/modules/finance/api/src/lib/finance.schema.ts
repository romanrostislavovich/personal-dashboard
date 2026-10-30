import {projects, users} from '@pd/api-core/schema';
import {
  ASSET_KINDS,
  COST_PROVIDERS,
  RECURRING_PERIODS,
  TRANSACTION_KINDS,
} from '@pd/contracts';
import {
  boolean,
  customType,
  date,
  index,
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
import {bankAccounts} from './bank/bank.schema';

export const transactionKind = pgEnum(
  'finance_transaction_kind',
  TRANSACTION_KINDS,
);
export const recurringPeriod = pgEnum(
  'finance_recurring_period',
  RECURRING_PERIODS,
);

/**
 * Recurring payments: servers, domains, subscriptions.
 * Once a month they turn into transactions (see RecurringPaymentsJob).
 */
export const recurringPayments = pgTable(
  'finance_recurring_payments',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    // restrict: a project cannot be deleted while it has financial records.
    projectId: uuid().references(() => projects.id, {onDelete: 'restrict'}),
    name: text().notNull(),
    amount: numeric({precision: 14, scale: 2, mode: 'number'}).notNull(),
    currency: text().notNull(),
    category: text().notNull(),
    dayOfMonth: smallint().notNull(),
    period: recurringPeriod().notNull().default('month'),
    /** 1–12: the month of a yearly charge. */
    monthOfYear: smallint(),
    trialEndsOn: date({mode: 'string'}),
    /** The trial end the reminder was sent for: once per date. */
    trialNotifiedFor: date({mode: 'string'}),
    /** A higher price seen in the transactions and reported: once per price. */
    noticedAmount: numeric({precision: 14, scale: 2, mode: 'number'}),
    isActive: boolean().notNull().default(true),
    lastChargedOn: date({mode: 'string'}),
    /** The contract behind it: the start, the term in months, the notice in days. */
    contractStartedOn: date({mode: 'string'}),
    contractMonths: smallint(),
    noticeDays: smallint(),
    autoRenews: boolean().notNull().default(true),
    priceLockedUntil: date({mode: 'string'}),
    /** The key dates already reminded of ("cancel-by:2026-11-01"): each once. */
    datesNotified: jsonb().$type<string[]>().notNull().default([]),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [index().on(table.userId), index().on(table.projectId)],
);

/** The earlier prices of a recurring payment: a row each time its amount changes. */
export const recurringPrices = pgTable(
  'finance_recurring_prices',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    recurringPaymentId: uuid()
      .notNull()
      .references(() => recurringPayments.id, {onDelete: 'cascade'}),
    /** The price before the change. */
    amount: numeric({precision: 14, scale: 2, mode: 'number'}).notNull(),
    changedOn: date({mode: 'string'}).notNull(),
  },
  table => [index().on(table.userId), index().on(table.recurringPaymentId)],
);

/** Repeating charges the user said are not subscriptions (by their lower-case note). */
export const subscriptionDismissals = pgTable(
  'finance_subscription_dismissals',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    key: text().notNull(),
  },
  table => [unique().on(table.userId, table.key)],
);

export const costProvider = pgEnum('finance_cost_provider', COST_PROVIDERS);

/**
 * Sources of automatic cost import (Hetzner, DeepSeek…). The API token is stored
 * in the core SecretsService under the key `finance.cost-source.<id>`.
 */
export const costSources = pgTable(
  'finance_cost_sources',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    projectId: uuid().references(() => projects.id, {onDelete: 'restrict'}),
    provider: costProvider().notNull(),
    name: text().notNull(),
    category: text().notNull(),
    /** Provider data between syncs (for example, the previous DeepSeek balance). */
    state: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    lastSyncedAt: timestamp({withTimezone: true}),
    lastError: text(),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [index().on(table.userId), index().on(table.projectId)],
);

/** Income and expenses. Without projectId — personal, with projectId — the project's. */
export const transactions = pgTable(
  'finance_transactions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    projectId: uuid().references(() => projects.id, {onDelete: 'restrict'}),
    recurringPaymentId: uuid().references(() => recurringPayments.id, {
      onDelete: 'set null',
    }),
    costSourceId: uuid().references(() => costSources.id, {
      onDelete: 'set null',
    }),
    /** Month `YYYY-MM` for which the amount was imported from a cost source. */
    costPeriod: text(),
    kind: transactionKind().notNull(),
    amount: numeric({precision: 14, scale: 2, mode: 'number'}).notNull(),
    currency: text().notNull(),
    category: text().notNull(),
    note: text(),
    occurredOn: date({mode: 'string'}).notNull(),
    /** Imported from a bank account (or matched with one): the operation's id in the bank. */
    bankAccountId: uuid().references(() => bankAccounts.id, {
      onDelete: 'set null',
    }),
    bankEntryId: text(),
    /** Who was paid or who paid, as the bank wrote it: the category follows it next time. */
    counterparty: text(),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  // One transaction per source and month — the sync updates it instead of creating new ones.
  table => [
    unique().on(table.costSourceId, table.costPeriod),
    // One transaction per operation of the bank, however often it is imported.
    unique().on(table.userId, table.bankEntryId),
    index().on(table.userId, table.occurredOn),
    index().on(table.projectId),
    index().on(table.recurringPaymentId),
  ],
);

/** Finance settings of a user. */
export const financeSettings = pgTable('finance_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, {onDelete: 'cascade'}),
  /** Totals are converted into it; `null` — the currency used most. */
  mainCurrency: text(),
});

/** Binary data (PostgreSQL `bytea`) as a Node.js Buffer. */
const bytea = customType<{data: Buffer}>({dataType: () => 'bytea'});

/** The photo of a receipt a transaction was recorded from (sent to the Telegram bot). */
export const financeReceipts = pgTable(
  'finance_receipts',
  {
    /** One receipt per transaction; it goes with the transaction. */
    transactionId: uuid()
      .primaryKey()
      .references(() => transactions.id, {onDelete: 'cascade'}),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    data: bytea().notNull(),
    mimeType: text().notNull(),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [index().on(table.userId)],
);

/** A monthly limit of a category (`*` — all expenses), in the main currency. */
export const financeBudgets = pgTable(
  'finance_budgets',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    category: text().notNull(),
    limit: numeric({precision: 14, scale: 2, mode: 'number'}).notNull(),
    /** The months (`YYYY-MM`) the 80% and the 100% of the limit were reported: once a month. */
    warnedMonth: text(),
    exceededMonth: text(),
  },
  table => [unique().on(table.userId, table.category)],
);

/** The AI's report of a month: kept, so it is written once and can be read again. */
export const financeReports = pgTable(
  'finance_reports',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    month: text().notNull(),
    summary: text().notNull(),
    text: text().notNull(),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [unique().on(table.userId, table.month)],
);

/** Something to buy one day: the price of its page in a shop is read every day. */
export const wishes = pgTable(
  'finance_wishes',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    url: text().notNull(),
    name: text().notNull(),
    note: text(),
    imageUrl: text(),
    /** The last price known: read from the page or typed in by hand. */
    price: numeric({precision: 14, scale: 2, mode: 'number'}),
    currency: text(),
    /** The price before the last change. */
    previousPrice: numeric({precision: 14, scale: 2, mode: 'number'}),
    checkedAt: timestamp({withTimezone: true}),
    /** Why the last check gave no price; `null` — it did. */
    checkError: text(),
    boughtAt: timestamp({withTimezone: true}),
    /** Whom it is a gift for: a name, as the person is called in Birthdays. */
    recipient: text(),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [index().on(table.userId)],
);

/** The price of a wish day by day: one point a day, the last one read that day. */
export const wishPrices = pgTable(
  'finance_wish_prices',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    wishId: uuid()
      .notNull()
      .references(() => wishes.id, {onDelete: 'cascade'}),
    day: date({mode: 'string'}).notNull(),
    price: numeric({precision: 14, scale: 2, mode: 'number'}).notNull(),
    currency: text().notNull(),
  },
  table => [unique().on(table.wishId, table.day), index().on(table.userId)],
);

export const assetKind = pgEnum('finance_asset_kind', ASSET_KINDS);

/** What one owns or owes besides the bank accounts, typed in by hand: cash, a deposit, a loan. */
export const financeAssets = pgTable(
  'finance_assets',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    name: text().notNull(),
    kind: assetKind().notNull(),
    /** Positive; a debt counts against. */
    amount: numeric({precision: 16, scale: 2, mode: 'number'}).notNull(),
    currency: text().notNull(),
    /** Money at hand: counts for the runway. */
    liquid: boolean().notNull(),
    updatedAt: timestamp({withTimezone: true}).notNull().defaultNow(),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [index().on(table.userId)],
);

/** The net worth of a day in the main currency: one point a day, the last one counted. */
export const netWorthDays = pgTable(
  'finance_net_worth_days',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    day: date({mode: 'string'}).notNull(),
    total: numeric({precision: 16, scale: 2, mode: 'number'}).notNull(),
    liquid: numeric({precision: 16, scale: 2, mode: 'number'}).notNull(),
    currency: text().notNull(),
  },
  table => [unique().on(table.userId, table.day)],
);

export type TransactionRow = typeof transactions.$inferSelect;
export type RecurringPaymentRow = typeof recurringPayments.$inferSelect;
export type CostSourceRow = typeof costSources.$inferSelect;
export type WishRow = typeof wishes.$inferSelect;
export type AssetRow = typeof financeAssets.$inferSelect;
