import { users } from '@pd/api-core/schema';
import { EventFeeling, QuestionnaireId } from '@pd/contracts';
import {
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

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
    /** `null` — the event is told by age (`ageFrom`). */
    startedOn: date({ mode: 'string' }),
    /** `null` — one day, or still going on. */
    endedOn: date({ mode: 'string' }),
    /** The age in full years it happened at, for what is remembered without dates. */
    ageFrom: smallint(),
    ageTo: smallint(),
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

export const psychologySettings = pgTable('psychology_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Puts the events told by age among the dated ones. */
  birthYear: smallint(),
});

export type PsychologyEventRow = typeof psychologyEvents.$inferSelect;
export type PsychologyAssessmentRow = typeof psychologyAssessments.$inferSelect;
