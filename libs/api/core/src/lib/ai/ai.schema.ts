import { boolean, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/users.schema';

/** Настройки AI пользователя. Ключ API хранится отдельно в SecretsService (`ai.api-key`). */
export const aiSettings = pgTable('ai_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: text().notNull(),
  baseUrl: text().notNull(),
  model: text().notNull(),
  morningDigest: boolean().notNull().default(false),
});
