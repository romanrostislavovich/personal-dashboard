import { date, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/users.schema';

/**
 * Days the user opened the dashboard or changed something in it (APP_TIMEZONE dates).
 * Only dashboard achievements read it: active days and streaks.
 */
export const activeDays = pgTable(
  'dashboard_active_days',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date({ mode: 'string' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day] })],
);
