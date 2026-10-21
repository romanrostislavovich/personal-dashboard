import {
  boolean,
  index,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../users/users.schema';
import { encryptedText, registerEncryptedTables } from '../crypto/encrypted-columns';
import { LifelogGenerated } from '@pd/contracts';

/** The last month (`YYYY-MM`) and year whose summaries went to the user: one message each. */
export const lifeMonths = pgTable('life_months', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  month: text().notNull(),
  year: text(),
});

/** Goals of a year: counted from a summary card of the modules, or by hand. */
export const lifeGoals = pgTable(
  'life_goals',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    year: smallint().notNull(),
    title: text().notNull(),
    /** A card key (`diary.life.entries`); `null` — `manualValue` is the progress. */
    metric: text(),
    target: numeric({ precision: 16, scale: 2, mode: 'number' }).notNull(),
    /** `atLeast` or `atMost`. */
    direction: text().notNull().default('atLeast'),
    manualValue: numeric({ precision: 16, scale: 2, mode: 'number' }).notNull().default(0),
    /** When it was reported as reached: once. */
    reachedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.userId)],
);

/** The AI's story of a month (`YYYY-MM`) or a year (`YYYY`), kept once written. */
export const lifeStories = pgTable(
  'life_stories',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    period: text().notNull(),
    text: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.period)],
);

/** Generated text and the user's own addition are independent, encrypted columns. */
export const lifelogNarratives = pgTable(
  'lifelog_narratives',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: text().notNull(),
    summaryText: encryptedText(),
    keyHighlight: encryptedText(),
    generatedBy: text().$type<LifelogGenerated['generatedBy']>(),
    sources: jsonb().$type<LifelogGenerated['sources']>().notNull().default([]),
    note: encryptedText().notNull(),
    generatedAt: timestamp({ withTimezone: true }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.day)],
);

registerEncryptedTables(lifelogNarratives);

export const lifelogSettings = pgTable('lifelog_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  enabled: boolean().notNull().default(false),
  lastAttemptDay: text(),
});
