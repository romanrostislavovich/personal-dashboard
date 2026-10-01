import { SteamClient } from './steam.client';

/** The match history is closed: "Expose Public Match Data" is off in Dota 2. */
export class SteamDotaPrivateError extends Error {}

/** Steam's own limit of matches a request. */
export const STEAM_HISTORY_PAGE = 100;
/** Steam never gives more than this many matches to one query, however it is paged. */
export const STEAM_HISTORY_LIMIT = 500;

/** A match as the history lists it: who, when and on which hero — without the result. */
export interface SteamListedMatch {
  matchId: number;
  heroId: number;
  startedAt: Date;
  lobbyType: number | null;
}

/** What the details of a match add to the list. */
export interface SteamMatchDetails {
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
  durationSec: number;
  gameMode: number | null;
  lobbyType: number | null;
  goldPerMin: number | null;
  xpPerMin: number | null;
  lastHits: number | null;
  denies: number | null;
  heroDamage: number | null;
  towerDamage: number | null;
  heroHealing: number | null;
  leaverStatus: number | null;
}

export interface SteamHistoryPage {
  matches: SteamListedMatch[];
  /** More matches of this query are left after the page. */
  hasMore: boolean;
}

/** Dota 2 matches straight from Valve (`IDOTA2Match_570` of the Steam Web API). */
export class SteamDotaClient extends SteamClient {
  /**
   * A page of the account's matches, newest first. `beforeMatchId` continues an earlier page,
   * `heroId` narrows the query to one hero — the way past the 500-match limit of a query.
   */
  async getMatchHistory(
    accountId: number,
    { beforeMatchId, heroId }: { beforeMatchId?: number; heroId?: number } = {},
  ): Promise<SteamHistoryPage> {
    const { result } = await this.get<{ result: RawHistory }>(
      '/IDOTA2Match_570/GetMatchHistory/v1/',
      {
        account_id: String(accountId),
        matches_requested: String(STEAM_HISTORY_PAGE),
        ...(beforeMatchId ? { start_at_match_id: String(beforeMatchId - 1) } : {}),
        ...(heroId ? { hero_id: String(heroId) } : {}),
      },
    );
    if (result.status === 15) {
      throw new SteamDotaPrivateError('The Dota 2 match history of the account is not public');
    }
    if (result.status !== 1) {
      throw new Error(`Steam match history: status ${result.status} ${result.statusDetail ?? ''}`);
    }
    return {
      matches: (result.matches ?? []).flatMap((match) => listedMatch(match, accountId)),
      hasMore: (result.results_remaining ?? 0) > 0,
    };
  }

  /** The result and the numbers of a match; `null` — Steam has no details for it. */
  async getMatchDetails(matchId: number, accountId: number): Promise<SteamMatchDetails | null> {
    const { result } = await this.get<{ result?: RawDetails }>(
      '/IDOTA2Match_570/GetMatchDetails/v1/',
      { match_id: String(matchId) },
    );
    // Steam is known to answer `{}` for a match it has no details for.
    return result ? matchDetails(result, accountId) : null;
  }
}

/** The account's row of a listed match; nothing if the player is not in it or picked no hero. */
export function listedMatch(match: RawListedMatch, accountId: number): SteamListedMatch[] {
  const player = match.players?.find((p) => p.account_id === accountId);
  if (!player?.hero_id) {
    return [];
  }
  return [
    {
      matchId: match.match_id,
      heroId: player.hero_id,
      startedAt: new Date(match.start_time * 1000),
      lobbyType: match.lobby_type ?? null,
    },
  ];
}

/** The account's side of the match details; `null` when Steam answered with an error. */
export function matchDetails(result: RawDetails, accountId: number): SteamMatchDetails | null {
  const player = result.players?.find((p) => p.account_id === accountId);
  if (result.error || !player || typeof result.radiant_win !== 'boolean') {
    return null;
  }
  return {
    // player_slot < 128 means the player is on Radiant.
    won: player.player_slot < 128 === result.radiant_win,
    kills: player.kills ?? 0,
    deaths: player.deaths ?? 0,
    assists: player.assists ?? 0,
    durationSec: result.duration ?? 0,
    gameMode: result.game_mode ?? null,
    lobbyType: result.lobby_type ?? null,
    goldPerMin: player.gold_per_min ?? null,
    xpPerMin: player.xp_per_min ?? null,
    lastHits: player.last_hits ?? null,
    denies: player.denies ?? null,
    heroDamage: player.hero_damage ?? null,
    towerDamage: player.tower_damage ?? null,
    heroHealing: player.hero_healing ?? null,
    leaverStatus: player.leaver_status ?? null,
  };
}

// --- Raw Steam API responses (only the fields we use) ---

interface RawHistory {
  status: number;
  statusDetail?: string;
  results_remaining?: number;
  matches?: RawListedMatch[];
}

export interface RawListedMatch {
  match_id: number;
  start_time: number;
  lobby_type?: number;
  players?: { account_id?: number; player_slot: number; hero_id?: number }[];
}

export interface RawDetails {
  error?: string;
  radiant_win?: boolean;
  duration?: number;
  game_mode?: number;
  lobby_type?: number;
  players?: {
    account_id?: number;
    player_slot: number;
    kills?: number;
    deaths?: number;
    assists?: number;
    leaver_status?: number;
    last_hits?: number;
    denies?: number;
    gold_per_min?: number;
    xp_per_min?: number;
    hero_damage?: number;
    tower_damage?: number;
    hero_healing?: number;
  }[];
}
