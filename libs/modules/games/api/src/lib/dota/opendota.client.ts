const API = 'https://api.opendota.com/api';
const STEAM_CDN = 'https://cdn.cloudflare.steamstatic.com';

export class DotaProfileNotFoundError extends Error {}

export interface DotaProfile {
  personaName: string;
  avatarUrl: string | null;
  profileUrl: string;
  rankTier: number | null;
  leaderboardRank: number | null;
}

export interface OpenDotaMatch {
  matchId: number;
  heroId: number;
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
  durationSec: number;
  startedAt: Date;
}

export interface HeroInfo {
  name: string;
  imageUrl: string;
}

/** OpenDota is an open API without a key (limit ~60 requests per minute). */
export const openDota = {
  async getProfile(accountId: number): Promise<DotaProfile> {
    const data = await get<RawPlayer>(`/players/${accountId}`);
    // For a non-existent or private account OpenDota responds without a profile.
    if (!data.profile) {
      throw new DotaProfileNotFoundError(`Dota account ${accountId} not found`);
    }
    return {
      personaName: data.profile.personaname,
      avatarUrl: data.profile.avatarfull ?? null,
      profileUrl: `https://www.opendota.com/players/${accountId}`,
      rankTier: data.rank_tier ?? null,
      leaderboardRank: data.leaderboard_rank ?? null,
    };
  },

  async getMatches(accountId: number, limit: number): Promise<OpenDotaMatch[]> {
    const matches = await get<RawMatch[]>(`/players/${accountId}/matches?limit=${limit}`);
    return matches.map((m) => ({
      matchId: m.match_id,
      heroId: m.hero_id,
      // player_slot < 128 means the player is on Radiant.
      won: m.player_slot < 128 === m.radiant_win,
      kills: m.kills,
      deaths: m.deaths,
      assists: m.assists,
      durationSec: m.duration,
      startedAt: new Date(m.start_time * 1000),
    }));
  },

  async getHeroes(): Promise<Map<number, HeroInfo>> {
    const heroes = await get<Record<string, RawHero>>('/constants/heroes');
    return new Map(
      Object.values(heroes).map((h) => [
        h.id,
        { name: h.localized_name, imageUrl: STEAM_CDN + h.img.replace(/\?$/, '') },
      ]),
    );
  },
};

async function get<T>(path: string): Promise<T> {
  const response = await fetch(API + path);
  if (!response.ok) {
    throw new Error(`OpenDota ${response.status}: ${path}`);
  }
  return (await response.json()) as T;
}

interface RawPlayer {
  profile?: { personaname: string; avatarfull?: string };
  rank_tier?: number | null;
  leaderboard_rank?: number | null;
}

interface RawMatch {
  match_id: number;
  player_slot: number;
  radiant_win: boolean;
  hero_id: number;
  kills: number;
  deaths: number;
  assists: number;
  duration: number;
  start_time: number;
}

interface RawHero {
  id: number;
  localized_name: string;
  img: string;
}
