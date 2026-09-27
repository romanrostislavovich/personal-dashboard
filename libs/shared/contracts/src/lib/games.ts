import { z } from 'zod';

export const GAMES = ['dota2', 'wow'] as const;
export type Game = (typeof GAMES)[number];

export const WOW_REGIONS = ['eu', 'us', 'kr', 'tw'] as const;
export type WowRegion = (typeof WOW_REGIONS)[number];

export const gameAccountInputSchema = z.discriminatedUnion('game', [
  z.object({
    game: z.literal('dota2'),
    /** Steam ID32, Steam ID64 or an OpenDota/Dotabuff/Steam profile link with a numeric id. */
    steamId: z.string().trim().min(1).max(200),
  }),
  z.object({
    game: z.literal('wow'),
    region: z.enum(WOW_REGIONS),
    /** Realm slug: "Гордунни" → `gordunni`, "Howling Fjord" → `howling-fjord`. */
    realm: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]+$/, 'Expected a realm slug like "howling-fjord"'),
    name: z.string().trim().min(2).max(12),
  }),
]);
export type GameAccountInput = z.infer<typeof gameAccountInputSchema>;

export const wowCredentialsInputSchema = z.object({
  clientId: z.string().trim().min(10),
  clientSecret: z.string().trim().min(10),
});
export type WowCredentialsInput = z.infer<typeof wowCredentialsInputSchema>;

export interface GamesSettings {
  /** Whether the Battle.net app keys are set (needed for WoW). */
  wowCredentials: boolean;
}

// --- Dota 2 ---

export interface DotaHero {
  id: number;
  name: string;
  imageUrl: string;
}

export const DOTA_MATCH_MODES = ['ranked', 'unranked', 'turbo', 'other'] as const;
export type DotaMatchMode = (typeof DOTA_MATCH_MODES)[number];

/**
 * Groups OpenDota game modes and lobby types into what a player thinks of:
 * Turbo, ranked, unranked matchmaking, everything else (custom games, bots, events…).
 */
export function dotaMatchMode(gameMode: number | null, lobbyType: number | null): DotaMatchMode {
  if (gameMode === 23) {
    return 'turbo';
  }
  if (lobbyType === 7) {
    return 'ranked';
  }
  return lobbyType === 0 ? 'unranked' : 'other';
}

export interface DotaMatch {
  matchId: number;
  hero: DotaHero;
  mode: DotaMatchMode;
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
  durationSec: number;
  startedAt: string;
}

export const DOTA_RECORDS = [
  'kills',
  'assists',
  'goldPerMin',
  'heroDamage',
  'lastHits',
  'durationSec',
] as const;
export type DotaRecordKind = (typeof DOTA_RECORDS)[number];

/** Personal best over the whole saved history. */
export interface DotaRecord {
  kind: DotaRecordKind;
  value: number;
  matchId: number;
  hero: DotaHero;
  startedAt: string;
}

export interface DotaSummary {
  game: 'dota2';
  personaName: string;
  avatarUrl: string | null;
  profileUrl: string;
  /** Two digits: medal (1 Herald … 8 Immortal) and stars. */
  rankTier: number | null;
  leaderboardRank: number | null;
  /** OpenDota cannot see the history — the player has to enable "Expose Public Match Data". */
  historyHidden: boolean;
  /** Over all saved matches. */
  totals: {
    matches: number;
    wins: number;
    heroesPlayed: number;
    hoursPlayed: number;
    firstMatchAt: string | null;
  };
  modes: { mode: DotaMatchMode; matches: number; wins: number }[];
  records: DotaRecord[];
  last30Days: { wins: number; losses: number };
  recentMatches: DotaMatch[];
  topHeroes: { hero: DotaHero; games: number; wins: number }[];
}

// --- World of Warcraft ---

export interface WowAchievement {
  id: number;
  name: string;
  completedAt: string;
}

export interface WowSummary {
  game: 'wow';
  name: string;
  realm: string;
  level: number;
  className: string;
  raceName: string;
  specName: string | null;
  guild: string | null;
  itemLevel: number | null;
  achievementPoints: number;
  totalAchievements: number;
  avatarUrl: string | null;
  profileUrl: string;
  lastLoginAt: string | null;
  recentAchievements: WowAchievement[];
}

export interface GameAccount {
  id: string;
  game: Game;
  displayName: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  /** `null` until the first sync has run. */
  summary: DotaSummary | WowSummary | null;
}
