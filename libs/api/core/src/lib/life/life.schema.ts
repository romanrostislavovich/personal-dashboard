import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/users.schema';

/** The last month (`YYYY-MM`) whose summary went to the user: one message a month. */
export const lifeMonths = pgTable('life_months', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  month: text().notNull(),
});
