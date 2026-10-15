import { encryptedText, registerEncryptedTables, users } from '@pd/api-core/schema';
import { HabitDayStatus, HabitGoal, HabitKind } from '@pd/contracts';
import {
  date,
  index,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

const owner = () =>
  uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

/**
 * A habit to quit or to cut down (see libs/shared/contracts habits.ts). Its own name is stored
 * encrypted: "what I am quitting" is as private as a medical record.
 */
export const habits = pgTable(
  'habits',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    kind: text().$type<HabitKind>().notNull(),
    name: encryptedText(),
    goal: text().$type<HabitGoal>().notNull(),
    maxDaysPerWeek: smallint(),
    unit: encryptedText(),
    startedOn: date({ mode: 'string' }).notNull(),
    /** The evening question in Telegram, `HH:mm`; `null` — none. */
    askAt: text(),
    /** The user's day it was last asked on: once a day, whatever restarts. */
    askedOn: date({ mode: 'string' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.userId)],
);

/** A day marked: with it (and how much, for a unit), or clean. A day with no mark is clean. */
export const habitDays = pgTable(
  'habit_days',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    habitId: uuid()
      .notNull()
      .references(() => habits.id, { onDelete: 'cascade' }),
    day: date({ mode: 'string' }).notNull(),
    status: text().$type<HabitDayStatus>().notNull(),
    amount: numeric({ precision: 10, scale: 2, mode: 'number' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.habitId, table.day), index().on(table.userId)],
);

registerEncryptedTables(habits);

export type HabitRow = typeof habits.$inferSelect;
export type HabitDayRow = typeof habitDays.$inferSelect;
