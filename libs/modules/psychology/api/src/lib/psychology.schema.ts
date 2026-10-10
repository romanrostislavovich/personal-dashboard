import { users } from '@pd/api-core/schema';
import { EventFeeling, QuestionnaireId } from '@pd/contracts';
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/** What the user noticed about themselves: free notes, a day each. */
export const psychologyNotes = pgTable(
  'psychology_notes',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date({ mode: 'string' }).notNull(),
    text: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.userId, table.day)],
);

/** Something that happened over a period: a move, an illness, a holiday, a new job. */
export const psychologyEvents = pgTable(
  'psychology_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    description: text(),
    startedOn: date({ mode: 'string' }).notNull(),
    /** `null` — one day, or still going on. */
    endedOn: date({ mode: 'string' }),
    /** How it felt: -2 (hard) … 2 (good). */
    feeling: smallint().$type<EventFeeling>().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.userId, table.startedOn)],
);

/** A filled-in questionnaire (see QUESTIONNAIRES): the answers, so the sum can be recounted. */
export const psychologyAssessments = pgTable(
  'psychology_assessments',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    test: text().$type<QuestionnaireId>().notNull(),
    takenOn: date({ mode: 'string' }).notNull(),
    answers: integer().array().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.userId, table.test, table.takenOn)],
);

/** The questions about a week and the answers to them; one set a week. */
export const psychologyReflections = pgTable(
  'psychology_reflections',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The Monday of the week. */
    week: date({ mode: 'string' }).notNull(),
    questions: text().array().notNull(),
    answers: text().array().notNull().default([]),
    byAi: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.week)],
);

export const psychologySettings = pgTable('psychology_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Three questions about the week on Sunday evening. */
  weeklyReview: boolean().notNull().default(false),
});

export type PsychologyEventRow = typeof psychologyEvents.$inferSelect;
export type PsychologyAssessmentRow = typeof psychologyAssessments.$inferSelect;
