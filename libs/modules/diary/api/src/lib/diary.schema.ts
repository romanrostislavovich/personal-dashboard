import { encryptedBytes, encryptedText, registerEncryptedTables, users } from '@pd/api-core/schema';
import { DiaryMark } from '@pd/contracts';
import {
  boolean,
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

/*
 * What a person writes is stored encrypted (`encryptedText`, see encrypted-columns.ts): the
 * text of an entry, the template, the photos and their captions. The tags and the emoji marks
 * stay plain — the filters and the statistics read them in the database.
 */

/** One entry per day. Notes from Telegram are appended to the current day's entry. */
export const diaryEntries = pgTable(
  'diary_entries',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date({ mode: 'string' }).notNull(),
    content: encryptedText().notNull().default(''),
    /** Counted when the entry is saved: the database cannot count the words of ciphertext. */
    words: integer().notNull().default(0),
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
  template: encryptedText(),
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
    caption: encryptedText(),
    data: encryptedBytes().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.userId, table.day)],
);

registerEncryptedTables(diaryEntries, diarySettings, diaryPhotos);

export type DiaryEntryRow = typeof diaryEntries.$inferSelect;
