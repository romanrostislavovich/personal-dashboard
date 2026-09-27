import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Пользователи. Даже если сейчас пользователь один, все данные модулей
 * привязаны к `userId` — так проект сразу готов к публичной многопользовательской версии.
 */
export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
  displayName: text().notNull(),
  locale: text().notNull().default('en'),
  telegramChatId: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
