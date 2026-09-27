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

export interface DotaMatch {
  matchId: number;
  hero: DotaHero;
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
  durationSec: number;
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
