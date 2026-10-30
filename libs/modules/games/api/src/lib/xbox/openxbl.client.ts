import {fetchWithTimeout} from '@pd/api-core';
import {XboxGame} from '@pd/contracts';

/** OpenXBL's API (its OpenAPI spec: https://api.xbl.io/docs/json); the old xbl.io/api/v2 takes no new keys. */
const API = 'https://api.xbl.io/v2';
const TIMEOUT_MS = 20_000;
/** The locale Xbox is asked in, by the user's language. */
const ACCEPT_LANGUAGES: Record<string, string> = {en: 'en-US', ru: 'ru-RU'};
/** The games kept: the last played first. */
const MAX_GAMES = 100;

/** OpenXBL did not accept the key. */
export class OpenXblKeyError extends Error {}
/** The free plan's limit of requests an hour is spent: the next sync goes on. */
export class OpenXblRateLimitError extends Error {}

export interface XboxProfile {
  xuid: string;
  gamertag: string;
  avatarUrl: string | null;
  gamerscore: number;
  tier: string | null;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function num(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/** The keys of an answer, two levels deep, with array lengths: why it gave no games, no values. */
export function shapeOf(raw: unknown, depth = 0): string {
  if (Array.isArray(raw)) {
    return `[${raw.length}]${raw.length && depth < 2 ? shapeOf(raw[0], depth + 1) : ''}`;
  }
  if (!isObject(raw)) {
    return typeof raw;
  }
  if (depth >= 2) {
    return '{…}';
  }
  return `{${Object.keys(raw)
    .slice(0, 8)
    .map(key => {
      const value = raw[key];
      return isObject(value) || Array.isArray(value)
        ? `${key}${shapeOf(value, depth + 1)}`
        : key;
    })
    .join(',')}}`;
}

/**
 * OpenXBL wraps every answer: `{ "content": {…}, "code": 200 }`; an older one did not. Xbox's own
 * refusal comes as a string in `content`, still with 200 — it is an error, not "no games".
 */
function unwrap(raw: unknown): unknown {
  if (
    isObject(raw) &&
    (typeof raw['content'] === 'string' || Array.isArray(raw['content']))
  ) {
    const said =
      typeof raw['content'] === 'string'
        ? raw['content']
        : raw['content'].join(' ');
    throw new Error(
      `Xbox answered: ${said.replace(/[[\]"]/g, '').slice(0, 200)}`,
    );
  }
  return isObject(raw) && isObject(raw['content']) ? raw['content'] : raw;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * The answer of `/account`: Xbox's profile settings as a list of `{ id, value }` (Gamertag,
 * Gamerscore, GameDisplayPicRaw, AccountTier…).
 */
export function parseProfile(raw: unknown): XboxProfile {
  const body = unwrap(raw);
  const user =
    isObject(body) && Array.isArray(body['profileUsers'])
      ? body['profileUsers'][0]
      : null;
  if (!isObject(user)) {
    throw new Error('OpenXBL gave no profile');
  }
  const settings = new Map<string, unknown>();
  for (const setting of (user['settings'] as unknown[]) ?? []) {
    if (isObject(setting) && typeof setting['id'] === 'string') {
      settings.set(setting['id'], setting['value']);
    }
  }
  const xuid = text(user['id']);
  const gamertag =
    text(settings.get('Gamertag')) ?? text(settings.get('ModernGamertag'));
  if (!xuid || !gamertag) {
    throw new Error('OpenXBL gave a profile without a gamertag');
  }
  return {
    xuid,
    gamertag,
    avatarUrl: text(settings.get('GameDisplayPicRaw')),
    gamerscore: num(settings.get('Gamerscore')),
    tier: text(settings.get('AccountTier')),
  };
}

/**
 * The answer of `/titles`: Xbox's title history with each title's achievements (TitleHub:
 * `titles[]` with `achievement` and `titleHistory`). The last played first.
 */
export function parseTitles(raw: unknown): XboxGame[] {
  const body = unwrap(raw);
  const titles =
    isObject(body) && Array.isArray(body['titles']) ? body['titles'] : [];
  const games: XboxGame[] = [];
  for (const title of titles) {
    if (!isObject(title)) {
      continue;
    }
    const titleId = text(String(title['titleId'] ?? ''));
    const name = text(title['name']);
    if (!titleId || !name) {
      continue;
    }
    const achievement = isObject(title['achievement'])
      ? title['achievement']
      : {};
    const history = isObject(title['titleHistory'])
      ? title['titleHistory']
      : {};
    // `/achievements` answers another shape: the gamerscore on the title, the achievements listed.
    const listed = Array.isArray(title['achievements'])
      ? title['achievements']
      : null;
    const total = listed
      ? listed.length
      : num(achievement['totalAchievements']);
    const unlocked = listed
      ? listed.filter(item => isObject(item) && item['isUnlocked'] === true)
          .length
      : num(achievement['currentAchievements']);
    games.push({
      titleId,
      name,
      imageUrl: text(title['displayImage']),
      gamerscore: num(
        achievement['currentGamerscore'] ?? title['currentGamerscore'],
      ),
      totalGamerscore: num(
        achievement['totalGamerscore'] ?? title['maxGamerscore'],
      ),
      // Older games tell what was unlocked but not how many there are (total 0).
      achievements:
        total > 0 || unlocked > 0 ? {unlocked, total: total || null} : null,
      lastPlayedAt: text(history['lastTimePlayed']),
    });
  }
  return games
    .sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''))
    .slice(0, MAX_GAMES);
}

/**
 * OpenXBL (xbl.io): Xbox Live through a key the user gets by signing in there with their Xbox
 * account — the key reads that account. The free plan allows about 150 requests an hour: a sync
 * makes two.
 */
export class OpenXblClient {
  /** `language` — the user's (`ru`, `en`): Xbox refuses the `*` fetch sends by default. */
  constructor(
    private readonly key: string,
    private readonly language = 'en',
  ) {}

  async profile(): Promise<XboxProfile> {
    return parseProfile(await this.get('/account'));
  }

  /**
   * The games: `/titles` first, then the other ways OpenXBL tells them, until one has any. With
   * none, `shapes` says what each answered (its keys, no values), to tell why.
   */
  async games(xuid: string): Promise<{games: XboxGame[]; shapes: string[]}> {
    const shapes: string[] = [];
    for (const path of [
      '/titles',
      `/titles/${xuid}`,
      `/achievements/player/${xuid}`,
      '/achievements',
    ]) {
      try {
        const raw = await this.get(path);
        const games = parseTitles(raw);
        if (games.length) {
          return {games, shapes: []};
        }
        shapes.push(`${path} → ${shapeOf(raw)}`);
      } catch (error) {
        if (
          error instanceof OpenXblKeyError ||
          error instanceof OpenXblRateLimitError
        ) {
          throw error;
        }
        shapes.push(
          `${path} → ${error instanceof Error ? error.message : String(error)}`.slice(
            0,
            260,
          ),
        );
      }
    }
    return {games: [], shapes};
  }

  private async get(path: string): Promise<unknown> {
    const response = await fetchWithTimeout(
      `${API}${path}`,
      {
        headers: {
          'x-authorization': this.key,
          accept: 'application/json',
          // Without it Node's fetch sends `*`, and Xbox's title history answers with an error.
          'accept-language': ACCEPT_LANGUAGES[this.language] ?? 'en-US',
        },
      },
      TIMEOUT_MS,
    );
    if (response.status === 401 || response.status === 403) {
      throw new OpenXblKeyError('OpenXBL did not accept the key');
    }
    if (response.status === 429) {
      throw new OpenXblRateLimitError(
        'OpenXBL: the hourly limit of requests is spent',
      );
    }
    if (!response.ok) {
      throw new Error(`OpenXBL answered ${response.status}`);
    }
    return response.json();
  }
}
