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
 * `externalId`: for Dota — the Steam account id (32-bit), for WoW — `region/realm/name`,
 * for Steam — the Steam ID64.
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
    /** When the full match history was last downloaded from OpenDota (Dota; refreshed once a day). */
    historySyncedAt: timestamp({ withTimezone: true }),
    /** When the whole match history was walked on Steam (Dota); after that the newest page is enough. */
    steamHistorySyncedAt: timestamp({ withTimezone: true }),
    lastError: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.game, table.externalId)],
);

/**
 * All Dota 2 matches of the account, every mode (ranked, turbo, unranked, custom…).
 * This is the user's own copy of the history: statistics and achievements are computed from it.
 * Steam lists a match (when, on which hero) before its result and numbers are known, and
 * OpenDota does not have every number of every match, so everything but the hero is nullable.
 */
export const dotaMatches = pgTable(
  'games_dota_matches',
  {
    accountId: uuid()
      .notNull()
      .references(() => gameAccounts.id, { onDelete: 'cascade' }),
    matchId: bigint({ mode: 'number' }).notNull(),
    heroId: integer().notNull(),
    /** `null` — the result is not known (yet): the match is not counted as a win or a loss. */
    won: boolean(),
    kills: integer(),
    deaths: integer(),
    assists: integer(),
    durationSec: integer(),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    /** https://github.com/odota/dotaconstants — game_mode.json (23 = Turbo). */
    gameMode: integer(),
    /** lobby_type.json: 0 = unranked matchmaking, 7 = ranked. */
    lobbyType: integer(),
    partySize: integer(),
    goldPerMin: integer(),
    xpPerMin: integer(),
    lastHits: integer(),
    denies: integer(),
    heroDamage: integer(),
    towerDamage: integer(),
    heroHealing: integer(),
    /** 0 — stayed until the end. */
    leaverStatus: integer(),
    /** When Steam was asked for the details: a match it has none for is not asked about again. */
    detailsCheckedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.matchId] }),
    index().on(table.accountId, table.startedAt),
  ],
);

/**
 * The library of a Steam account: every game with its playtime, and the achievements of the
 * played ones. Updated by the sync; playtime only grows, so a row changes when a game is played.
 */
export const steamGames = pgTable(
  'games_steam_games',
  {
    accountId: uuid()
      .notNull()
      .references(() => gameAccounts.id, { onDelete: 'cascade' }),
    appId: integer().notNull(),
    name: text().notNull(),
    iconHash: text(),
    playtimeMinutes: integer().notNull().default(0),
    playtime2WeeksMinutes: integer().notNull().default(0),
    lastPlayedAt: timestamp({ withTimezone: true }),
    /** `null` — the game has no achievements, or they were not read yet. */
    achievementsUnlocked: integer(),
    achievementsTotal: integer(),
    /** The playtime at which the achievements were last read: they are re-read once it grows. */
    achievementsPlaytime: integer(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.appId] })],
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
