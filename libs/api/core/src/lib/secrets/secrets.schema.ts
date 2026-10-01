import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/users.schema';

/**
 * The user's integration tokens and keys (GitHub, Sentry, Last.fm…).
 * The value is stored encrypted (AES-256-GCM), see SecretsService.
 */
export const userSecrets = pgTable(
  'user_secrets',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Key prefixed with the module id: `development.github-token`. */
    key: text().notNull(),
    encryptedValue: text().notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.key] })],
);
