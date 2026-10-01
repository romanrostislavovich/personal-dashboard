const API = 'https://api.steampowered.com';
const TIMEOUT_MS = 20_000;

/** Steam did not accept the Web API key. */
export class SteamKeyError extends Error {}
/** Steam asks to slow down; the rest of the work waits for the next sync. */
export class SteamRateLimitError extends Error {}
export class SteamProfileNotFoundError extends Error {}

export interface SteamPlayer {
  steamId: string;
  personaName: string;
  avatarUrl: string | null;
  profileUrl: string;
  /** When the account was created; hidden on a private profile. */
  createdAt: string | null;
}

export interface SteamOwnedGame {
  appId: number;
  name: string;
  /** The hash of the small icon, see `steamIconUrl` in contracts. */
  iconHash: string | null;
  playtimeMinutes: number;
  playtime2WeeksMinutes: number;
  lastPlayedAt: Date | null;
}

export interface SteamAchievementCount {
  unlocked: number;
  total: number;
}

/**
 * Steam Web API with the user's key (steamcommunity.com/dev/apikey). One key reads any public
 * profile. The key travels in the address, so an address never gets into an error text.
 */
export class SteamClient {
  constructor(private readonly key: string) {}

  /** Key check: a request for a profile is answered 403 when Steam does not know the key. */
  async verify(): Promise<void> {
    // Any id will do — the key is checked before the profile is looked for.
    await this.get('/ISteamUser/GetPlayerSummaries/v2/', { steamids: '76561197960435530' });
  }

  /** The Steam ID64 behind a custom profile address (`steamcommunity.com/id/<name>`). */
  async resolveVanity(name: string): Promise<string | null> {
    const { response } = await this.get<{ response: { success: number; steamid?: string } }>(
      '/ISteamUser/ResolveVanityURL/v1/',
      { vanityurl: name },
    );
    return response.success === 1 && response.steamid ? response.steamid : null;
  }

  async getPlayer(steamId: string): Promise<SteamPlayer> {
    const { response } = await this.get<{ response: { players: RawPlayer[] } }>(
      '/ISteamUser/GetPlayerSummaries/v2/',
      { steamids: steamId },
    );
    const player = response.players[0];
    if (!player) {
      throw new SteamProfileNotFoundError(`Steam profile ${steamId} not found`);
    }
    return {
      steamId: player.steamid,
      personaName: player.personaname,
      avatarUrl: player.avatarfull ?? null,
      profileUrl: player.profileurl,
      createdAt: player.timecreated ? new Date(player.timecreated * 1000).toISOString() : null,
    };
  }

  /** `null` — the level is hidden. */
  async getLevel(steamId: string): Promise<number | null> {
    const { response } = await this.get<{ response: { player_level?: number } }>(
      '/IPlayerService/GetSteamLevel/v1/',
      { steamid: steamId },
    );
    return response.player_level ?? null;
  }

  /** Every game of the library with its playtime; `null` — "Game details" are not public. */
  async getOwnedGames(steamId: string): Promise<SteamOwnedGame[] | null> {
    const { response } = await this.get<{ response: { games?: RawGame[] } }>(
      '/IPlayerService/GetOwnedGames/v1/',
      {
        steamid: steamId,
        include_appinfo: '1',
        // Free games (Dota 2 among them) are left out of the list unless all three are asked for.
        include_played_free_games: '1',
        include_free_sub: '1',
        skip_unvetted_apps: 'false',
      },
    );
    return response.games ? response.games.map(toOwnedGame) : null;
  }

  /**
   * Games played in the last two weeks. Steam lists free games here even when the library
   * leaves them out, so the two lists are put together (`mergeGames`).
   */
  async getRecentGames(steamId: string): Promise<SteamOwnedGame[]> {
    const { response } = await this.get<{ response: { games?: RawGame[] } }>(
      '/IPlayerService/GetRecentlyPlayedGames/v1/',
      { steamid: steamId },
    );
    return (response.games ?? []).map(toOwnedGame);
  }

  /** Achievements of a game: how many are unlocked; `null` — the game has none (or hides them). */
  async getAchievements(steamId: string, appId: number): Promise<SteamAchievementCount | null> {
    const data = await this.get<{ playerstats?: { achievements?: { achieved: number }[] } }>(
      '/ISteamUserStats/GetPlayerAchievements/v1/',
      { steamid: steamId, appid: String(appId) },
      // "Requested app has no stats" and a hidden profile come as 400 and 403 with a body.
      { tolerate: [400, 403] },
    );
    const achievements = data?.playerstats?.achievements;
    return achievements?.length
      ? {
          unlocked: achievements.filter((a) => a.achieved === 1).length,
          total: achievements.length,
        }
      : null;
  }

  /**
   * One request. `tolerate` — statuses that mean "nothing for this item" rather than a failure;
   * the answer is then `null`. A rejected key is told apart from them by Steam's plain-text body.
   */
  protected async get<T>(
    path: string,
    params: Record<string, string>,
    options: { tolerate: number[] },
  ): Promise<T | null>;
  protected async get<T>(path: string, params: Record<string, string>): Promise<T>;
  protected async get<T>(
    path: string,
    params: Record<string, string>,
    { tolerate = [] as number[] } = {},
  ): Promise<T | null> {
    const query = new URLSearchParams({ key: this.key, format: 'json', ...params });
    const response = await fetch(`${API}${path}?${query}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) {
      return (await response.json()) as T;
    }
    if (response.status === 429) {
      throw new SteamRateLimitError('Steam asks to slow down (429)');
    }
    const body = await response.text().catch(() => '');
    // A bad key is answered with an HTML page ("Access is denied… verify your key= parameter").
    if ([401, 403].includes(response.status) && /key=|access is denied/i.test(body)) {
      throw new SteamKeyError('Steam Web API key is invalid');
    }
    if (tolerate.includes(response.status)) {
      return null;
    }
    // What was asked (without the key) and what Steam said: a bare status explains nothing.
    const asked = new URLSearchParams(params).toString();
    const said = body.split(this.key).join('…').replace(/\s+/g, ' ').trim().slice(0, 200);
    throw new Error(`Steam ${response.status}: ${path}?${asked}${said ? ` — ${said}` : ''}`);
  }
}

function toOwnedGame(game: RawGame): SteamOwnedGame {
  return {
    appId: game.appid,
    name: game.name ?? `App ${game.appid}`,
    iconHash: game.img_icon_url || null,
    playtimeMinutes: game.playtime_forever ?? 0,
    playtime2WeeksMinutes: game.playtime_2weeks ?? 0,
    lastPlayedAt: game.rtime_last_played ? new Date(game.rtime_last_played * 1000) : null,
  };
}

/** The library plus the recently played games it does not list. */
export function mergeGames(owned: SteamOwnedGame[], recent: SteamOwnedGame[]): SteamOwnedGame[] {
  const known = new Set(owned.map((game) => game.appId));
  return [...owned, ...recent.filter((game) => !known.has(game.appId))];
}

// --- Raw Steam API responses (only the fields we use) ---

interface RawPlayer {
  steamid: string;
  personaname: string;
  profileurl: string;
  avatarfull?: string;
  timecreated?: number;
}

interface RawGame {
  appid: number;
  name?: string;
  img_icon_url?: string;
  playtime_forever?: number;
  playtime_2weeks?: number;
  rtime_last_played?: number;
}
