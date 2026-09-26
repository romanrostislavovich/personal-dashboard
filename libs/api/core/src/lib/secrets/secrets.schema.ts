import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/users.schema';

/**
 * Токены и ключи интеграций пользователя (GitHub, Sentry, Last.fm…).
 * Значение хранится зашифрованным (AES-256-GCM), см. SecretsService.
 */
export const userSecrets = pgTable(
  'user_secrets',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Ключ с префиксом модуля: `github-oss.token`. */
    key: text().notNull(),
    encryptedValue: text().notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.key] })],
);
