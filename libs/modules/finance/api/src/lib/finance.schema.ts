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
 * Регулярные платежи: серверы, домены, подписки.
 * Раз в месяц превращаются в операции (см. RecurringPaymentsJob).
 */
export const recurringPayments = pgTable('finance_recurring_payments', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // restrict: нельзя удалить проект, пока у него есть финансовые записи.
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
 * Источники автоимпорта затрат (Hetzner, DeepSeek…). API-токен хранится
 * в SecretsService ядра под ключом `finance.cost-source.<id>`.
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
  /** Данные провайдера между синхронизациями (например, прошлый баланс DeepSeek). */
  state: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  lastSyncedAt: timestamp({ withTimezone: true }),
  lastError: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Доходы и расходы. Без projectId — личные, с projectId — расходы/доходы проекта. */
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
    /** Месяц `YYYY-MM`, за который импортирована сумма из источника затрат. */
    costPeriod: text(),
    kind: transactionKind().notNull(),
    amount: numeric({ precision: 14, scale: 2, mode: 'number' }).notNull(),
    currency: text().notNull(),
    category: text().notNull(),
    note: text(),
    occurredOn: date({ mode: 'string' }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  // Одна операция на источник и месяц — синхронизация обновляет её, а не плодит новые.
  (table) => [unique().on(table.costSourceId, table.costPeriod)],
);

export type TransactionRow = typeof transactions.$inferSelect;
export type RecurringPaymentRow = typeof recurringPayments.$inferSelect;
export type CostSourceRow = typeof costSources.$inferSelect;
