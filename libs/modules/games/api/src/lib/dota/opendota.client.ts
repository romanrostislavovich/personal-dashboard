const API = 'https://api.opendota.com/api';
const STEAM_CDN = 'https://cdn.cloudflare.steamstatic.com';
/** The same hero list OpenDota serves, straight from the project's repository. */
const HEROES_MIRROR =
  'https://raw.githubusercontent.com/odota/dotaconstants/master/build/heroes.json';

export class DotaProfileNotFoundError extends Error {}
/** OpenDota did not accept the API key (mistyped, revoked, out of credit). */
export class OpenDotaKeyError extends Error {}

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

/**
 * OpenDota works without a key, with a small shared allowance of requests a day; the user's
 * own key (`apiKey`, from Settings → Integrations) lifts it. `null` — no key.
 */
export const openDota = {
  /** Key check: any request answers 400 for a key OpenDota does not know. */
  async verifyKey(apiKey: string): Promise<void> {
    await request('GET', '/constants/game_mode', apiKey);
  },

  async getProfile(accountId: number, apiKey: string | null = null): Promise<DotaProfile> {
    const data = await get<RawPlayer>(`/players/${accountId}`, apiKey);
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
  async getMatches(
    accountId: number,
    limit?: number,
    apiKey: string | null = null,
  ): Promise<OpenDotaMatch[]> {
    const params = new URLSearchParams({ significant: '0' });
    if (limit) {
      params.set('limit', String(limit));
    }
    MATCH_FIELDS.forEach((field) => params.append('project', field));
    const matches = await get<RawMatch[]>(`/players/${accountId}/matches?${params}`, apiKey);
    return matches.filter(wasPlayed).map((m) => ({
      matchId: m.match_id,
      heroId: m.hero_id as number,
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
  async requestRefresh(accountId: number, apiKey: string | null = null): Promise<void> {
    await request('POST', `/players/${accountId}/refresh`, apiKey);
  },

  async getHeroes(): Promise<Map<number, HeroInfo>> {
    return toHeroes(await get<Record<string, RawHero>>('/constants/heroes'));
  },

  /** The hero list from the mirror: for when the OpenDota API itself is down. */
  async getHeroesFromMirror(): Promise<Map<number, HeroInfo>> {
    const response = await fetch(HEROES_MIRROR);
    if (!response.ok) {
      throw new Error(`Hero list mirror ${response.status}`);
    }
    return toHeroes((await response.json()) as Record<string, RawHero>);
  },
};

/** Hero id → name and picture from the constants file (OpenDota and its mirror share the format). */
export function toHeroes(heroes: Record<string, RawHero>): Map<number, HeroInfo> {
  return new Map(
    Object.values(heroes).map((h) => [
      h.id,
      { name: h.localized_name, imageUrl: STEAM_CDN + h.img.replace(/\?$/, '') },
    ]),
  );
}

async function get<T>(path: string, apiKey: string | null = null): Promise<T> {
  return (await (await request('GET', path, apiKey)).json()) as T;
}

async function request(
  method: 'GET' | 'POST',
  path: string,
  apiKey: string | null = null,
): Promise<Response> {
  const response = await fetch(withKey(API + path, apiKey), { method });
  // The key never gets into an error text: it would end up in the log and on the page.
  if (apiKey && [400, 401, 403].includes(response.status)) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (/api key/i.test(body?.error ?? '')) {
      throw new OpenDotaKeyError(`OpenDota: ${body?.error}`);
    }
  }
  if (!response.ok) {
    throw new Error(`OpenDota ${response.status}: ${method} ${path.split('?')[0]}`);
  }
  return response;
}

/**
 * A record of a game that was really played. Old histories hold broken ones — no hero (the
 * game ended before the pick) or no winner — which cannot be saved or counted as a loss.
 */
export function wasPlayed(match: Pick<RawMatch, 'hero_id' | 'radiant_win'>): boolean {
  return Boolean(match.hero_id) && typeof match.radiant_win === 'boolean';
}

/** The address with the key as the `api_key` parameter OpenDota expects. */
export function withKey(url: string, apiKey: string | null): string {
  return apiKey
    ? `${url}${url.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(apiKey)}`
    : url;
}

interface RawPlayer {
  profile?: { personaname: string; avatarfull?: string; fh_unavailable?: boolean };
  rank_tier?: number | null;
  leaderboard_rank?: number | null;
}

export interface RawMatch {
  match_id: number;
  player_slot: number;
  radiant_win: boolean | null;
  hero_id: number | null;
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

export interface RawHero {
  id: number;
  localized_name: string;
  img: string;
}
