import { projects, users } from '@pd/api-core/schema';
import { TRANSACTION_KINDS } from '@pd/contracts';
import {
  boolean,
  date,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
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

/** Доходы и расходы. Без projectId — личные, с projectId — расходы/доходы проекта. */
export const transactions = pgTable('finance_transactions', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid().references(() => projects.id, { onDelete: 'restrict' }),
  recurringPaymentId: uuid().references(() => recurringPayments.id, { onDelete: 'set null' }),
  kind: transactionKind().notNull(),
  amount: numeric({ precision: 14, scale: 2, mode: 'number' }).notNull(),
  currency: text().notNull(),
  category: text().notNull(),
  note: text(),
  occurredOn: date({ mode: 'string' }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type TransactionRow = typeof transactions.$inferSelect;
export type RecurringPaymentRow = typeof recurringPayments.$inferSelect;
