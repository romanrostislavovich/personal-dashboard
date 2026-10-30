import type {AccessTokenScope} from '@pd/contracts';
import {index, pgTable, text, timestamp, uuid} from 'drizzle-orm/pg-core';
import {users} from '../users/users.schema';

/**
 * Tokens an outside AI client reaches the user's data with (MCP): only the SHA-256 of a token
 * is kept — the token is shown once. In `public`, so a token made on the server works on the
 * user's own computer too (sync).
 */
export const accessTokens = pgTable(
  'access_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    name: text().notNull(),
    scope: text().$type<AccessTokenScope>().notNull(),
    tokenHash: text().notNull().unique(),
    /** The first characters of the token, to tell the tokens apart in the list. */
    hint: text().notNull(),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
    lastUsedAt: timestamp({withTimezone: true}),
  },
  table => [index().on(table.userId)],
);

export type AccessTokenRow = typeof accessTokens.$inferSelect;
