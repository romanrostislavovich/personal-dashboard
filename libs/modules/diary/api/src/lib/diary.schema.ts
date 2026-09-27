import { users } from '@pd/api-core/schema';
import { DiaryMark } from '@pd/contracts';
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/** Binary data (PostgreSQL `bytea`) as a Node.js Buffer. */
const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

/** One entry per day. Notes from Telegram are appended to the current day's entry. */
export const diaryEntries = pgTable(
  'diary_entries',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date({ mode: 'string' }).notNull(),
    content: text().notNull().default(''),
    mood: smallint(),
    /** Hashtags from the text — stored separately for fast filtering. */
    tags: text().array().notNull().default([]),
    /** Emoji marks from the text (`==🔥 text==`) — for filtering by emoji. */
    marks: jsonb().$type<DiaryMark[]>().notNull().default([]),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.day)],
);

export const diarySettings = pgTable('diary_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  eveningReminder: boolean().notNull().default(false),
  weeklySummary: boolean().notNull().default(false),
  template: text(),
});

/**
 * Photos of a day. They live in the database next to the text, so one backup keeps everything.
 * Not tied to an entry row: a day may have photos before any text is written.
 */
export const diaryPhotos = pgTable(
  'diary_photos',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date({ mode: 'string' }).notNull(),
    mimeType: text().notNull(),
    size: integer().notNull(),
    caption: text(),
    data: bytea().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.userId, table.day)],
);

export type DiaryEntryRow = typeof diaryEntries.$inferSelect;
