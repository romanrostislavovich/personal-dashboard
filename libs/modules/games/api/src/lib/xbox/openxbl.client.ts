import { fetchWithTimeout } from '@pd/api-core';
import { XboxGame } from '@pd/contracts';

const API = 'https://xbl.io/api/v2';
const TIMEOUT_MS = 20_000;
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

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * The answer of `/account`: Xbox's profile settings as a list of `{ id, value }` (Gamertag,
 * Gamerscore, GameDisplayPicRaw, AccountTier…).
 */
export function parseProfile(raw: unknown): XboxProfile {
  const user = isObject(raw) && Array.isArray(raw['profileUsers']) ? raw['profileUsers'][0] : null;
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
  const gamertag = text(settings.get('Gamertag')) ?? text(settings.get('ModernGamertag'));
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
 * The answer of `/achievements`: Xbox's title history with each title's achievements (TitleHub:
 * `titles[]` with `achievement` and `titleHistory`). The last played first.
 */
export function parseTitles(raw: unknown): XboxGame[] {
  const titles = isObject(raw) && Array.isArray(raw['titles']) ? raw['titles'] : [];
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
    const achievement = isObject(title['achievement']) ? title['achievement'] : {};
    const history = isObject(title['titleHistory']) ? title['titleHistory'] : {};
    const total = num(achievement['totalAchievements']);
    games.push({
      titleId,
      name,
      imageUrl: text(title['displayImage']),
      gamerscore: num(achievement['currentGamerscore']),
      totalGamerscore: num(achievement['totalGamerscore']),
      achievements: total > 0 ? { unlocked: num(achievement['currentAchievements']), total } : null,
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
  constructor(private readonly key: string) {}

  async profile(): Promise<XboxProfile> {
    return parseProfile(await this.get('/account'));
  }

  async games(): Promise<XboxGame[]> {
    return parseTitles(await this.get('/achievements'));
  }

  private async get(path: string): Promise<unknown> {
    const response = await fetchWithTimeout(
      `${API}${path}`,
      { headers: { 'x-authorization': this.key, accept: 'application/json' } },
      TIMEOUT_MS,
    );
    if (response.status === 401 || response.status === 403) {
      throw new OpenXblKeyError('OpenXBL did not accept the key');
    }
    if (response.status === 429) {
      throw new OpenXblRateLimitError('OpenXBL: the hourly limit of requests is spent');
    }
    if (!response.ok) {
      throw new Error(`OpenXBL answered ${response.status}`);
    }
    return response.json();
  }
}
