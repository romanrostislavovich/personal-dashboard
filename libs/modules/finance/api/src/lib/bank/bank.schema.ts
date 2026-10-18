import { encryptedText, registerEncryptedTables, users } from '@pd/api-core/schema';
import { boolean, date, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const owner = () =>
  uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

/**
 * A bank connected through open banking (Enable Banking): the session the user's consent gave,
 * good until `validUntil` (PSD2: about 180 days, then the user confirms it again). The bank's
 * login never reaches the dashboard — only this session, stored encrypted.
 */
export const bankConnections = pgTable(
  'finance_bank_connections',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    /** The bank as the provider names it (`PKO BP`) and its country. */
    bank: text().notNull(),
    country: text().notNull(),
    sessionId: encryptedText().notNull(),
    validUntil: timestamp({ withTimezone: true }),
    /** The day the reminder to confirm the access again was sent for: once per consent. */
    remindedFor: date({ mode: 'string' }),
    lastSyncedAt: timestamp({ withTimezone: true }),
    lastError: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.userId)],
);

/** An account of a connected bank; only the `enabled` ones are imported. */
export const bankAccounts = pgTable(
  'finance_bank_accounts',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    connectionId: uuid()
      .notNull()
      .references(() => bankConnections.id, { onDelete: 'cascade' }),
    /** The provider's id of the account in the session. */
    uid: text().notNull(),
    iban: encryptedText(),
    name: text(),
    currency: text(),
    enabled: boolean().notNull().default(false),
    /** The latest booking day imported: the next import starts a few days before it. */
    lastBookedOn: date({ mode: 'string' }),
    lastSyncedAt: timestamp({ withTimezone: true }),
    /** What the bank said is on the account at its latest import (available, else booked). */
    balance: numeric({ precision: 14, scale: 2, mode: 'number' }),
    balanceCurrency: text(),
    balanceAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.userId), index().on(table.connectionId)],
);

registerEncryptedTables(bankConnections, bankAccounts);

export type BankConnectionRow = typeof bankConnections.$inferSelect;
export type BankAccountRow = typeof bankAccounts.$inferSelect;
