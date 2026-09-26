import { users } from '@pd/api-core/schema';
import { integer, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const birthdays = pgTable('birthdays', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  month: smallint().notNull(),
  day: smallint().notNull(),
  year: smallint(),
  note: text(),
  remindDaysBefore: integer().array().notNull().default([0, 1, 7]),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type BirthdayRow = typeof birthdays.$inferSelect;
