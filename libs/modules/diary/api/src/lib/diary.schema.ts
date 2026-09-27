import { users } from '@pd/api-core/schema';
import {
  boolean,
  date,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/** Одна запись на день. Записи из Telegram дописываются в запись текущего дня. */
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
    /** Хэштеги из текста — хранятся отдельно, чтобы быстро фильтровать. */
    tags: text().array().notNull().default([]),
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
});

export type DiaryEntryRow = typeof diaryEntries.$inferSelect;
