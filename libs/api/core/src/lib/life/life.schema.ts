import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import {users} from '../users/users.schema';
import {
  encryptedText,
  registerEncryptedTables,
} from '../crypto/encrypted-columns';
import {LifelogGenerated} from '@pd/contracts';

/** The last month (`YYYY-MM`) and year whose summaries went to the user: one message each. */
export const lifeMonths = pgTable('life_months', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, {onDelete: 'cascade'}),
  month: text().notNull(),
  year: text(),
});

/** The AI's story of a month (`YYYY-MM`) or a year (`YYYY`), kept once written. */
export const lifeStories = pgTable(
  'life_stories',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    period: text().notNull(),
    text: text().notNull(),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [unique().on(table.userId, table.period)],
);

/** Generated text and the user's own addition are independent, encrypted columns. */
export const lifelogNarratives = pgTable(
  'lifelog_narratives',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    day: text().notNull(),
    summaryText: encryptedText(),
    keyHighlight: encryptedText(),
    generatedBy: text().$type<LifelogGenerated['generatedBy']>(),
    sources: jsonb().$type<LifelogGenerated['sources']>().notNull().default([]),
    note: encryptedText().notNull(),
    generatedAt: timestamp({withTimezone: true}),
    updatedAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [unique().on(table.userId, table.day)],
);

registerEncryptedTables(lifelogNarratives);

export const lifelogSettings = pgTable('lifelog_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, {onDelete: 'cascade'}),
  enabled: boolean().notNull().default(false),
  lastAttemptDay: text(),
});
