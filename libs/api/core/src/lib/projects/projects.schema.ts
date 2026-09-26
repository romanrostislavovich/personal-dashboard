import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/users.schema';

/** Твои сайты/сервисы. Модули (финансы, аналитика…) ссылаются на `projects.id`. */
export const projects = pgTable('projects', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  url: text(),
  description: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
