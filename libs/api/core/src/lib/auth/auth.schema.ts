import { index, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/users.schema';

/**
 * Sign-in sessions live in their own schema, so they are not synced (docs/sync.md): each instance
 * — the server, a local copy — has its own devices signed in to it.
 */
export const authSchema = pgSchema('auth');

/**
 * A signed-in device or browser. It holds the refresh token (only its SHA-256), which gives out
 * short-lived access tokens; deleting the row signs the device out.
 */
export const sessions = authSchema.table(
  'sessions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull().unique(),
    /** The token before the last rotation, still accepted for a minute: two tabs may race. */
    previousHash: text(),
    rotatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Moves forward with every use: an idle device is signed out after a while. */
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    userAgent: text(),
    ip: text(),
  },
  (table) => [index().on(table.userId), index().on(table.previousHash)],
);

export type SessionRow = typeof sessions.$inferSelect;
