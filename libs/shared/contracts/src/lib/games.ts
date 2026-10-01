import { z } from 'zod';

export const GAMES = ['dota2', 'wow', 'steam'] as const;
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
    game: z.literal('steam'),
    /** Steam ID64, a profile link or the custom name of `steamcommunity.com/id/<name>`. */
    steamId: z.string().trim().min(2).max(200),
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

export const openDotaKeyInputSchema = z.object({
  /** The API key from opendota.com/api-keys. */
  apiKey: z.string().trim().min(10).max(200),
});
export type OpenDotaKeyInput = z.infer<typeof openDotaKeyInputSchema>;

export const steamKeyInputSchema = z.object({
  /** The Web API key from steamcommunity.com/dev/apikey. */
  apiKey: z.string().trim().min(10).max(200),
});
export type SteamKeyInput = z.infer<typeof steamKeyInputSchema>;

export interface GamesSettings {
  /** Whether the Steam Web API key is set: Steam accounts and Dota matches are read with it. */
  steamKey: boolean;
  /** Whether the Battle.net app keys are set (needed for WoW). */
  wowCredentials: boolean;
  /** Dota accounts (ids) with an OpenDota API key of their own: not bound by the free limit. */
  openDotaKeyAccounts: string[];
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

/** One Dota account in the overview: the profile and its share of the matches. */
export interface DotaAccountSummary {
  id: string;
  personaName: string;
  avatarUrl: string | null;
  profileUrl: string | null;
  rankTier: number | null;
  leaderboardRank: number | null;
  historyHidden: boolean;
  matches: number;
  wins: number;
  lastMatchAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

/** A hero over the selected accounts; kills, deaths and assists are averages per match. */
export interface DotaHeroStats {
  hero: DotaHero;
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  goldPerMin: number | null;
  xpPerMin: number | null;
  lastPlayedAt: string;
}

/** Matches on a day (in the dashboard time zone), for the activity calendar. */
export interface DotaActivityDay {
  day: string;
  matches: number;
  wins: number;
}

/** A match in a list over several accounts. */
export interface DotaListedMatch extends DotaMatch {
  accountId: string;
  goldPerMin: number | null;
  xpPerMin: number | null;
  lastHits: number | null;
  heroDamage: number | null;
}

/** The Dota page (in the spirit of Dotabuff's player overview) over one account or all of them. */
export interface DotaOverview {
  accounts: DotaAccountSummary[];
  totals: {
    matches: number;
    wins: number;
    heroesPlayed: number;
    hoursPlayed: number;
    /** Sums over all matches: KDA = (kills + assists) / deaths. */
    kills: number;
    deaths: number;
    assists: number;
    firstMatchAt: string | null;
    lastMatchAt: string | null;
  };
  modes: { mode: DotaMatchMode; matches: number; wins: number }[];
  last30Days: { wins: number; losses: number };
  records: (DotaRecord & { accountId: string })[];
  /** Every hero played, most played first. */
  heroes: DotaHeroStats[];
  /** The last 365 days, only days with matches. */
  activity: DotaActivityDay[];
  recentMatches: DotaListedMatch[];
}

/** `accountId` missing — all Dota accounts of the user. */
export const dotaOverviewQuerySchema = z.object({ accountId: z.uuid().optional() });
export type DotaOverviewQuery = z.infer<typeof dotaOverviewQuerySchema>;

export const DOTA_RESULTS = ['win', 'loss'] as const;

export const dotaMatchesQuerySchema = z.object({
  accountId: z.uuid().optional(),
  heroId: z.coerce.number().int().positive().optional(),
  mode: z.enum(DOTA_MATCH_MODES).optional(),
  result: z.enum(DOTA_RESULTS).optional(),
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
});
export type DotaMatchesQuery = z.infer<typeof dotaMatchesQuerySchema>;

export interface DotaMatchesPage {
  items: DotaListedMatch[];
  total: number;
  page: number;
  pageSize: number;
}

// --- Steam ---

/** A game of the Steam library. */
export interface SteamGame {
  appId: number;
  name: string;
  /** The hash of the small icon (see `steamIconUrl`); `null` — the game has none. */
  iconHash: string | null;
  /** Playtime over all time and over the last two weeks, minutes. */
  minutes: number;
  minutes2Weeks: number;
  lastPlayedAt: string | null;
  /** `null` — the game has no achievements (or they were not read yet). */
  achievements: { unlocked: number; total: number } | null;
}

export interface SteamSummary {
  game: 'steam';
  personaName: string;
  avatarUrl: string | null;
  profileUrl: string;
  level: number | null;
  /** When the account was created (ISO); hidden on a private profile. */
  createdAt: string | null;
  /** "Game details" of the profile are not public: Steam does not tell the library. */
  gamesHidden: boolean;
  totals: {
    /** Games in the library and the ones ever started. */
    games: number;
    played: number;
    minutes: number;
    minutes2Weeks: number;
    /** Achievements unlocked over all games. */
    achievements: number;
  };
  /** Played games, the most played first (at most a hundred). */
  games: SteamGame[];
}

/** The small square icon of a Steam game. */
export function steamIconUrl(appId: number, iconHash: string): string {
  return `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/${iconHash}.jpg`;
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
  /** Blizzard class id (1 Warrior … 13 Evoker); `null` until the next sync of an old profile. */
  classId: number | null;
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
  summary: DotaSummary | WowSummary | SteamSummary | null;
}
