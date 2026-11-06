import {users} from '@pd/api-core/schema';
import {date, pgTable, real, text, unique, uuid} from 'drizzle-orm/pg-core';

/**
 * Links v2's indices of each day (see dayIndices): counted by a server job from the day's spans,
 * unlocks and notifications, and kept, as two years of raw spans are too many to read on every
 * request. A sync client gets them with the sync and counts none itself.
 */
export const activityDayIndices = pgTable(
  'activity_day_indices',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    /** The user's own day. */
    day: date({mode: 'string'}).notNull(),
    /** `phone.restlessness`, `deepWork`…; `_lastUse` — kept for the bedtime, not shown. */
    key: text().notNull(),
    value: real().notNull(),
  },
  table => [unique().on(table.userId, table.day, table.key)],
);
