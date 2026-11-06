import {
  boolean,
  date,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import {users} from '../users/users.schema';

/**
 * The days a number's level changed (see changePoints), over the whole history: found by a
 * nightly server job and kept, as two years of every number are too many to search on every
 * request. A sync client gets them with the sync and searches none itself.
 */
export const linksChangePoints = pgTable(
  'links_change_points',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    /** The number's key, e.g. `activity.phone.night`, and how to show it (see DailyMetric). */
    key: text().notNull(),
    module: text().notNull(),
    labelKey: text().notNull(),
    label: text(),
    unit: text().notNull(),
    currency: text(),
    extra: boolean().notNull().default(false),
    outcome: boolean().notNull().default(false),
    /** The first day of the new level. */
    day: date({mode: 'string'}).notNull(),
    before: real().notNull(),
    after: real().notNull(),
    /** The difference of the levels in the days' spread: how large. */
    effect: real().notNull(),
    /** When a Telegram message told of it; a change moved by a few days keeps it. */
    notifiedAt: timestamp({withTimezone: true}),
  },
  table => [unique().on(table.userId, table.key, table.day)],
);

/**
 * What of Links the user has opened (a change point, a dose–response chart): for the
 * achievements of exploring, never for the numbers themselves.
 */
export const linksSeen = pgTable(
  'links_seen',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    /** `change` — a change point; `dose` — the chart of a pair. */
    kind: text().notNull(),
    /** The change's `key@day`, or the pair's `a|b`. */
    key: text().notNull(),
    seenAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [unique().on(table.userId, table.kind, table.key)],
);
