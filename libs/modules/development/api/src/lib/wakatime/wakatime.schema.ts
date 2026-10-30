import {users} from '@pd/api-core/schema';
import {WakatimeBreakdown} from '@pd/contracts';
import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type {WakatimeSlice} from './wakatime-durations';

/** The connected WakaTime account. The API key is in SecretsService. */
export const wakatimeSettings = pgTable('wakatime_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, {onDelete: 'cascade'}),
  /** `null` — disconnected; the saved days stay. */
  username: text(),
  lastSyncedAt: timestamp({withTimezone: true}),
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
      .references(() => users.id, {onDelete: 'cascade'}),
    day: date({mode: 'string'}).notNull(),
    totalSeconds: integer().notNull(),
  },
  table => [primaryKey({columns: [table.userId, table.day]})],
);

/** A day split by project, language, editor, OS, category and machine. */
export const wakatimeDayBreakdown = pgTable(
  'wakatime_day_breakdown',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    day: date({mode: 'string'}).notNull(),
    kind: text().$type<WakatimeBreakdown>().notNull(),
    name: text().notNull(),
    seconds: integer().notNull(),
  },
  table => [
    primaryKey({columns: [table.userId, table.day, table.kind, table.name]}),
  ],
);

/**
 * Stretches of coding with their beginning and end, by project and by computer: with them the
 * coding time is put together with the tracker's and the browser's by the clock (what overlaps
 * counts once), and the time next to work on a project can be told. Kept from the day the sync
 * began to copy them — older days have only their totals above.
 */
export const wakatimeSpans = pgTable(
  'wakatime_spans',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    kind: text().$type<WakatimeSlice>().notNull(),
    /** The project, or the computer. */
    name: text().notNull(),
    startedAt: timestamp({withTimezone: true}).notNull(),
    endedAt: timestamp({withTimezone: true}).notNull(),
    /** The day of WakaTime it was read for: a day read again replaces its stretches. */
    day: date({mode: 'string'}).notNull(),
  },
  table => [
    primaryKey({
      columns: [table.userId, table.kind, table.name, table.startedAt],
    }),
    index().on(table.userId, table.startedAt),
  ],
);

export type WakatimeSettingsRow = typeof wakatimeSettings.$inferSelect;
