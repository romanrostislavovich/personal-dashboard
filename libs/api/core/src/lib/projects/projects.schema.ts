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
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
