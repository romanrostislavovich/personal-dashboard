import { users } from '@pd/api-core/schema';
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/*
 * The password vault keeps only what the device encrypted: the server cannot read a password, a
 * login, a site or a title — nor the vault key. No `encryptedText` here: a second layer with
 * the server's own key would add nothing the device's does not already give.
 */

/** How the vault key is reached (see vault-crypto.ts): one row a user. */
export const vaultKeys = pgTable('vault_keys', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  kdf: text().notNull(),
  iterations: integer().notNull(),
  salt: text().notNull(),
  wrappedByPassword: text().notNull(),
  wrappedByRecovery: text().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** An item: its ciphertext and when it changed — nothing else is known about it here. */
export const vaultItems = pgTable(
  'vault_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    data: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.userId)],
);
