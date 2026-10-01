import { users } from '@pd/api-core/schema';
import { WakatimeBreakdown } from '@pd/contracts';
import { date, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** The connected WakaTime account. The API key is in SecretsService. */
export const wakatimeSettings = pgTable('wakatime_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** `null` — disconnected; the saved days stay. */
  username: text(),
  lastSyncedAt: timestamp({ withTimezone: true }),
  syncError: text(),
});

/**
 * Coding time per day. WakaTime keeps only the latest days on the free plan, so every day
 * is copied here and the history grows in the dashboard.
 */
export const wakatimeDays = pgTable(
  'wakatime_days',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date({ mode: 'string' }).notNull(),
    totalSeconds: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day] })],
);

/** A day split by project, language, editor, OS, category and machine. */
export const wakatimeDayBreakdown = pgTable(
  'wakatime_day_breakdown',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date({ mode: 'string' }).notNull(),
    kind: text().$type<WakatimeBreakdown>().notNull(),
    name: text().notNull(),
    seconds: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day, table.kind, table.name] })],
);

export type WakatimeSettingsRow = typeof wakatimeSettings.$inferSelect;
