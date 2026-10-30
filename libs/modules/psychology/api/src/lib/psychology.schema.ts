import {
  encryptedText,
  registerEncryptedTables,
  users,
} from '@pd/api-core/schema';
import {EventFeeling, QuestionnaireId} from '@pd/contracts';
import {
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Something that happened over a period: a move, an illness, a holiday, a new job. */
export const psychologyEvents = pgTable(
  'psychology_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    title: text().notNull(),
    description: text(),
    /** `null` — the event is told by age (`ageFrom`). */
    startedOn: date({mode: 'string'}),
    /** `null` — one day, or still going on. */
    endedOn: date({mode: 'string'}),
    /** The age in full years it happened at, for what is remembered without dates. */
    ageFrom: smallint(),
    ageTo: smallint(),
    /** How it felt: -2 (hard) … 2 (good). */
    feeling: smallint().$type<EventFeeling>().notNull().default(0),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [index().on(table.userId, table.startedOn)],
);

/** A filled-in questionnaire (see QUESTIONNAIRES): the answers, so the sum can be recounted. */
export const psychologyAssessments = pgTable(
  'psychology_assessments',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    test: text().$type<QuestionnaireId>().notNull(),
    takenOn: date({mode: 'string'}).notNull(),
    answers: integer().array().notNull(),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [index().on(table.userId, table.test, table.takenOn)],
);

export const psychologySettings = pgTable('psychology_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, {onDelete: 'cascade'}),
  /** Puts the events told by age among the dated ones. */
  birthYear: smallint(),
  /** A questionnaire to be reminded of (`who5`…), every so many days, at a time of day. */
  reminderTest: text(),
  reminderEveryDays: smallint(),
  reminderAt: text(),
  /** The day the last reminder went out: not again before the period passes. */
  remindedOn: date({mode: 'string'}),
  /** A close person for the help button, and their Telegram: encrypted, like the diary. */
  closeName: encryptedText(),
  closeTelegram: encryptedText(),
});

/** A small step of one's own library for a gentle day: stored encrypted, like the diary. */
export const psychologyGentleSteps = pgTable(
  'psychology_gentle_steps',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    text: encryptedText().notNull(),
    /** The smaller version of the step; `null` — none. */
    smaller: encryptedText(),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [index().on(table.userId)],
);

/**
 * A day the gentle mode was turned on, with its steps. The steps are copies, not links to the
 * library: a step deleted from it stays in the days it was taken on. The JSON is encrypted as a
 * whole.
 */
export const psychologyGentleDays = pgTable(
  'psychology_gentle_days',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    localDate: date({mode: 'string'}).notNull(),
    /** `GentleDayStep[]` as JSON. */
    steps: encryptedText().notNull(),
    updatedAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [uniqueIndex().on(table.userId, table.localDate)],
);

/** A brief for an appointment with a specialist: the texts are stored encrypted. */
export const psychologyBriefs = pgTable(
  'psychology_briefs',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    title: encryptedText().notNull(),
    appointmentOn: date({mode: 'string'}),
    from: date({mode: 'string'}).notNull(),
    to: date({mode: 'string'}).notNull(),
    /** The records picked by hand: Psychology's events and questionnaires. */
    eventIds: uuid().array().notNull().default([]),
    assessmentIds: uuid().array().notNull().default([]),
    changes: encryptedText().notNull().default(''),
    /** The questions, one per line. */
    questions: encryptedText().notNull().default(''),
    notes: encryptedText().notNull().default(''),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
    updatedAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [index().on(table.userId, table.from)],
);

registerEncryptedTables(
  psychologySettings,
  psychologyGentleSteps,
  psychologyGentleDays,
  psychologyBriefs,
);

export type PsychologyBriefRow = typeof psychologyBriefs.$inferSelect;
export type PsychologyEventRow = typeof psychologyEvents.$inferSelect;
export type PsychologyAssessmentRow = typeof psychologyAssessments.$inferSelect;
