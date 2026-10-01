import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Users. Even with a single user, all module data is
 * tied to `userId` — so the project is ready for a public multi-user setup.
 */
export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
  displayName: text().notNull(),
  locale: text().notNull().default('en'),
  /** IANA zone of the user's device; `null` — not known yet, the server's zone is used. */
  timeZone: text(),
  telegramChatId: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
