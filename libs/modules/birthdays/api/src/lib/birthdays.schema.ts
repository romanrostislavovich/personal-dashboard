import { encryptedText, registerEncryptedTables, users } from '@pd/api-core/schema';
import { index, integer, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * People and the dates to remember: the birthday and, for someone who has died, the day of
 * memory. Either date may be unknown, never both (see birthdayInputSchema).
 */
export const birthdays = pgTable(
  'birthdays',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    /** `null` — the birthday is not known. */
    month: smallint(),
    day: smallint(),
    year: smallint(),
    /** What one knows about the person: stored encrypted (see encrypted-columns.ts). */
    note: encryptedText(),
    remindDaysBefore: integer().array().notNull().default([0, 1, 7]),
    /** The day the person died; `null` — alive. The year is optional. */
    deathMonth: smallint(),
    deathDay: smallint(),
    deathYear: smallint(),
    memorialRemindDaysBefore: integer().array().notNull().default([0, 1]),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.userId)],
);

registerEncryptedTables(birthdays);

export type BirthdayRow = typeof birthdays.$inferSelect;
