const API = 'https://api.opendota.com/api';
const STEAM_CDN = 'https://cdn.cloudflare.steamstatic.com';

export class DotaProfileNotFoundError extends Error {}

export interface DotaProfile {
  personaName: string;
  avatarUrl: string | null;
  profileUrl: string;
  rankTier: number | null;
  leaderboardRank: number | null;
  /**
   * OpenDota cannot see the match history: "Expose Public Match Data" is off in Dota 2
   * (Settings → Options → Social), or the history has not been fetched yet.
   */
  historyHidden: boolean;
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
  gameMode: number | null;
  lobbyType: number | null;
  partySize: number | null;
  goldPerMin: number | null;
  xpPerMin: number | null;
  lastHits: number | null;
  denies: number | null;
  heroDamage: number | null;
  towerDamage: number | null;
  heroHealing: number | null;
  leaverStatus: number | null;
}

export interface HeroInfo {
  name: string;
  imageUrl: string;
}

/** Match fields we ask OpenDota for (`project` parameter); everything else is skipped. */
const MATCH_FIELDS = [
  'player_slot',
  'radiant_win',
  'hero_id',
  'kills',
  'deaths',
  'assists',
  'duration',
  'start_time',
  'game_mode',
  'lobby_type',
  'party_size',
  'gold_per_min',
  'xp_per_min',
  'last_hits',
  'denies',
  'hero_damage',
  'tower_damage',
  'hero_healing',
  'leaver_status',
] as const;

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
      historyHidden: data.profile.fh_unavailable === true,
    };
  },

  /**
   * Matches of every mode, newest first; without `limit` — the whole history in one request.
   * `significant=0`: by default OpenDota drops Turbo and other non-standard modes.
   */
  async getMatches(accountId: number, limit?: number): Promise<OpenDotaMatch[]> {
    const params = new URLSearchParams({ significant: '0' });
    if (limit) {
      params.set('limit', String(limit));
    }
    MATCH_FIELDS.forEach((field) => params.append('project', field));
    const matches = await get<RawMatch[]>(`/players/${accountId}/matches?${params}`);
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
      gameMode: m.game_mode ?? null,
      lobbyType: m.lobby_type ?? null,
      partySize: m.party_size ?? null,
      goldPerMin: m.gold_per_min ?? null,
      xpPerMin: m.xp_per_min ?? null,
      lastHits: m.last_hits ?? null,
      denies: m.denies ?? null,
      heroDamage: m.hero_damage ?? null,
      towerDamage: m.tower_damage ?? null,
      heroHealing: m.hero_healing ?? null,
      leaverStatus: m.leaver_status ?? null,
    }));
  },

  /** Asks OpenDota to re-download the player's history from Steam (takes minutes to hours). */
  async requestRefresh(accountId: number): Promise<void> {
    await request('POST', `/players/${accountId}/refresh`);
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
  return (await (await request('GET', path)).json()) as T;
}

async function request(method: 'GET' | 'POST', path: string): Promise<Response> {
  const response = await fetch(API + path, { method });
  if (!response.ok) {
    throw new Error(`OpenDota ${response.status}: ${method} ${path.split('?')[0]}`);
  }
  return response;
}

interface RawPlayer {
  profile?: { personaname: string; avatarfull?: string; fh_unavailable?: boolean };
  rank_tier?: number | null;
  leaderboard_rank?: number | null;
}

interface RawMatch {
  match_id: number;
  player_slot: number;
  radiant_win: boolean | null;
  hero_id: number;
  kills: number;
  deaths: number;
  assists: number;
  duration: number;
  start_time: number;
  game_mode?: number | null;
  lobby_type?: number | null;
  party_size?: number | null;
  gold_per_min?: number | null;
  xp_per_min?: number | null;
  last_hits?: number | null;
  denies?: number | null;
  hero_damage?: number | null;
  tower_damage?: number | null;
  hero_healing?: number | null;
  leaver_status?: number | null;
}

interface RawHero {
  id: number;
  localized_name: string;
  img: string;
}
