import { projects, users } from '@pd/api-core/schema';
import { ChecklistItem, ReminderStatus, Repeat, TaskPriority } from '@pd/contracts';
import {
  date,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/** The user's own lists of tasks: "Home", "Work". */
export const taskLists = pgTable(
  'tasks_lists',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.name)],
);

/** The TODO list. A done task stays, with `completedAt` set. */
export const tasks = pgTable(
  'tasks',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // A deleted list or project leaves its tasks: they go back to the inbox.
    listId: uuid().references(() => taskLists.id, { onDelete: 'set null' }),
    projectId: uuid().references(() => projects.id, { onDelete: 'set null' }),
    title: text().notNull(),
    notes: text().notNull().default(''),
    /** The day it is due, in the user's own calendar (no time zone). */
    dueDate: date({ mode: 'string' }),
    priority: smallint().$type<TaskPriority>().notNull().default(0),
    tags: text().array().notNull().default([]),
    checklist: jsonb().$type<ChecklistItem[]>().notNull().default([]),
    /** Once done, a repeating task comes back as a new one on its next day. */
    repeat: jsonb().$type<Repeat>(),
    completedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.userId, table.completedAt)],
);

/**
 * Reminders: a text sent at a moment. A repeating one is a series — every time it goes off, a
 * copy without the repeat is made for the user to answer ("done", "later"), and the series
 * moves on to its next time.
 */
export const reminders = pgTable(
  'tasks_reminders',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The task it is about; the reminder goes with the task. */
    taskId: uuid().references(() => tasks.id, { onDelete: 'cascade' }),
    text: text().notNull(),
    remindAt: timestamp({ withTimezone: true }).notNull(),
    repeat: jsonb().$type<Repeat>(),
    status: text().$type<ReminderStatus>().notNull().default('scheduled'),
    firedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.status, table.remindAt)],
);

export type TaskRow = typeof tasks.$inferSelect;
export type ReminderRow = typeof reminders.$inferSelect;
