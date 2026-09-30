import { boolean, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/users.schema';

/**
 * Saved AI connections: several per user, one of them active (see `aiSettings`).
 * The API key is stored separately in SecretsService under `ai.connection.<id>`.
 */
export const aiConnections = pgTable('ai_connections', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  provider: text().notNull(),
  baseUrl: text().notNull(),
  model: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** User AI settings: which connection is active, the morning digest. */
export const aiSettings = pgTable('ai_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Deleting the active connection leaves none active; the service then picks another.
  activeConnectionId: uuid().references(() => aiConnections.id, { onDelete: 'set null' }),
  morningDigest: boolean().notNull().default(false),
});

/**
 * The facts of each morning digest section as last sent: the next digest tells only what
 * differs from them (see `digestChanges`).
 */
export const morningDigestSnapshots = pgTable(
  'morning_digest_snapshots',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sectionId: text().notNull(),
    facts: jsonb().notNull(),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.sectionId] })],
);

export type AiConnectionRow = typeof aiConnections.$inferSelect;
