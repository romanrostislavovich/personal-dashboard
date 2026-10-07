import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/users.schema';

/** Your sites/services. Modules (finance, analytics…) reference `projects.id`. */
export const projects = pgTable('projects', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  url: text(),
  description: text(),
  /** Other names it goes by: a repository, a folder in an IDE (see LinksService). */
  aliases: text().array().notNull().default([]),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
