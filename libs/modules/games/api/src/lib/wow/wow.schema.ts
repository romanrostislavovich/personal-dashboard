import { users } from '@pd/api-core/schema';
import { WowDetails } from '@pd/contracts';
import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { gameAccounts } from '../games.schema';

/**
 * Everything about a WoW character beyond its summary line (gear, talents, Mythic+, raids, PvP,
 * collections…): the latest snapshot, one row per character.
 */
export const wowDetails = pgTable('games_wow_details', {
  accountId: uuid()
    .primaryKey()
    .references(() => gameAccounts.id, { onDelete: 'cascade' }),
  details: jsonb().$type<WowDetails>().notNull(),
  /** Tell about the character's news; on unless the user switches it off. */
  notify: boolean().notNull().default(true),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Daily history of a character: Blizzard gives only the current numbers. */
export const wowDays = pgTable(
  'games_wow_days',
  {
    accountId: uuid()
      .notNull()
      .references(() => gameAccounts.id, { onDelete: 'cascade' }),
    day: date({ mode: 'string' }).notNull(),
    itemLevel: integer(),
    mythicRating: integer(),
    achievementPoints: integer(),
    mounts: integer(),
    pets: integer(),
    toys: integer(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.day] })],
);

/** The price of the WoW Token per day, for the regions the user has characters in. */
export const wowTokenDays = pgTable(
  'games_wow_token_days',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    region: text().notNull(),
    day: date({ mode: 'string' }).notNull(),
    /** Gold. */
    price: integer().notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.region, table.day] })],
);
