import { users } from '@pd/api-core/schema';
import { GAMES } from '@pd/contracts';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const gameEnum = pgEnum('games_game', GAMES);

/**
 * The user's game accounts.
 * `externalId`: for Dota — the Steam account id (32-bit), for WoW — `region/realm/name`.
 */
export const gameAccounts = pgTable(
  'games_accounts',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    game: gameEnum().notNull(),
    externalId: text().notNull(),
    displayName: text().notNull(),
    /** The latest profile snapshot (different for each game, see DotaProfile / WowProfile). */
    profile: jsonb().$type<Record<string, unknown>>(),
    lastSyncedAt: timestamp({ withTimezone: true }),
    lastError: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.game, table.externalId)],
);

/** Dota 2 matches — accumulated locally for statistics (and future achievements). */
export const dotaMatches = pgTable(
  'games_dota_matches',
  {
    accountId: uuid()
      .notNull()
      .references(() => gameAccounts.id, { onDelete: 'cascade' }),
    matchId: bigint({ mode: 'number' }).notNull(),
    heroId: integer().notNull(),
    won: boolean().notNull(),
    kills: integer().notNull(),
    deaths: integer().notNull(),
    assists: integer().notNull(),
    durationSec: integer().notNull(),
    startedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.matchId] }),
    index().on(table.accountId, table.startedAt),
  ],
);

/** Earned WoW achievements — to notice new ones and send a notification. */
export const wowAchievements = pgTable(
  'games_wow_achievements',
  {
    accountId: uuid()
      .notNull()
      .references(() => gameAccounts.id, { onDelete: 'cascade' }),
    achievementId: integer().notNull(),
    name: text().notNull(),
    completedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.achievementId] })],
);

export type GameAccountRow = typeof gameAccounts.$inferSelect;
