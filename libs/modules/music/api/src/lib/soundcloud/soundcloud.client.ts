const SITE = 'https://soundcloud.com';
const API = 'https://api-v2.soundcloud.com';
const TIMEOUT_MS = 30_000;
/** SoundCloud answers its own site; a bare client is turned away. */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const TRACKS_PAGE = '200';
/** A guard against an endless listing: 50 pages are 10,000 tracks. */
const MAX_PAGES = 50;
/** The site's scripts are checked from the last one: the id sits in one of the app bundles. */
const SCRIPT = /https:\/\/a-v2\.sndcdn\.com\/assets\/[^"']+\.js/g;
const CLIENT_ID = /client_id\s*[:=]\s*"([A-Za-z0-9]{20,40})"/;

/** SoundCloud did not accept the sign-in token. */
export class SoundcloudAuthError extends Error {}
export class SoundcloudNotFoundError extends Error {}

export interface SoundcloudUser {
  id: string;
  /** The name from the profile's address. */
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  permalinkUrl: string;
  followers: number;
}

export interface SoundcloudTrackSnapshot {
  id: string;
  title: string;
  permalinkUrl: string;
  artworkUrl: string | null;
  isPrivate: boolean;
  publishedAt: string;
  durationMs: number;
  genre: string | null;
  plays: number;
  likes: number;
  reposts: number;
  comments: number;
  downloads: number;
}

/** The id the SoundCloud site itself calls its API with; found once and kept. */
let siteClientId: string | null = null;

/**
 * SoundCloud through the API of its own site. SoundCloud gives keys for the official API only on
 * request, so this reads what the site reads: the client id is taken from the site's scripts.
 * It is not a documented interface — SoundCloud may change it any day, and the sync then fails
 * with an error until this file follows.
 *
 * `token` — the sign-in token of the account (the `oauth_token` cookie of the site): with it the
 * owner's private tracks are listed too.
 */
export class SoundcloudClient {
  constructor(private readonly token: string | null = null) {}

  /** The profile behind the name of its address. */
  async resolveUser(username: string): Promise<SoundcloudUser> {
    const user = await this.get<RawUser>('/resolve', { url: `${SITE}/${username}` });
    if (!user || user.kind !== 'user') {
      throw new SoundcloudNotFoundError(`SoundCloud profile ${username} not found`);
    }
    return toUser(user);
  }

  async getUser(id: string): Promise<SoundcloudUser> {
    const user = await this.get<RawUser>(`/users/${id}`);
    if (!user) {
      throw new SoundcloudNotFoundError('The SoundCloud profile is gone');
    }
    return toUser(user);
  }

  /** The account the token belongs to: a token check. */
  async me(): Promise<SoundcloudUser> {
    const user = await this.get<RawUser>('/me');
    if (!user) {
      throw new SoundcloudAuthError('SoundCloud did not accept the token');
    }
    return toUser(user);
  }

  /** Every track of the profile; the private ones only for its owner (with the token). */
  async listTracks(userId: string): Promise<SoundcloudTrackSnapshot[]> {
    const tracks: SoundcloudTrackSnapshot[] = [];
    let next: string | null =
      `${API}/users/${userId}/tracks?limit=${TRACKS_PAGE}&linked_partitioning=1`;
    for (let page = 0; next && page < MAX_PAGES; page++) {
      const body: RawPage | null = await this.request<RawPage>(next);
      tracks.push(...(body?.collection ?? []).map(toTrack));
      next = body?.next_href ?? null;
    }
    return tracks;
  }

  private get<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
    const query = new URLSearchParams(params).toString();
    return this.request<T>(`${API}${path}${query ? `?${query}` : ''}`);
  }

  /**
   * One request; `null` for 404. A stale client id (SoundCloud replaces it now and then) is
   * looked up again once.
   */
  private async request<T>(address: string): Promise<T | null> {
    let response = await this.fetch(address, await clientId());
    if ((response.status === 401 || response.status === 403) && !this.token) {
      response = await this.fetch(address, await clientId({ fresh: true }));
    }
    if (response.ok) {
      return (await response.json()) as T;
    }
    if (response.status === 404) {
      return null;
    }
    if (response.status === 401 && this.token) {
      throw new SoundcloudAuthError('SoundCloud did not accept the token');
    }
    const path = new URL(address).pathname;
    throw new Error(`SoundCloud ${response.status}: ${path}`);
  }

  private fetch(address: string, id: string): Promise<Response> {
    const url = new URL(address);
    url.searchParams.set('client_id', id);
    return fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        ...(this.token ? { Authorization: `OAuth ${this.token}` } : {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }
}

/** The client id of the SoundCloud site, read from its scripts. */
async function clientId({ fresh = false } = {}): Promise<string> {
  if (siteClientId && !fresh) {
    return siteClientId;
  }
  const page = await text(SITE);
  // The newest bundles come last in the page.
  for (const script of [...new Set(page.match(SCRIPT) ?? [])].reverse()) {
    const found = findClientId(await text(script));
    if (found) {
      siteClientId = found;
      return found;
    }
  }
  throw new Error('SoundCloud changed its site: the client id was not found in its scripts');
}

export function findClientId(script: string): string | null {
  return script.match(CLIENT_ID)?.[1] ?? null;
}

async function text(address: string): Promise<string> {
  const response = await fetch(address, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`SoundCloud ${response.status}: ${new URL(address).pathname}`);
  }
  return response.text();
}

function toUser(raw: RawUser): SoundcloudUser {
  return {
    id: String(raw.id),
    username: raw.permalink,
    displayName: raw.username || null,
    avatarUrl: raw.avatar_url || null,
    permalinkUrl: raw.permalink_url,
    followers: raw.followers_count ?? 0,
  };
}

/** A track without comments or with hidden counters answers `null` for them. */
export function toTrack(raw: RawTrack): SoundcloudTrackSnapshot {
  return {
    id: String(raw.id),
    title: raw.title,
    permalinkUrl: raw.permalink_url,
    artworkUrl: raw.artwork_url || null,
    isPrivate: raw.sharing === 'private' || raw.public === false,
    publishedAt: raw.created_at,
    durationMs: raw.duration ?? 0,
    genre: raw.genre || null,
    plays: raw.playback_count ?? 0,
    likes: raw.likes_count ?? 0,
    reposts: raw.reposts_count ?? 0,
    comments: raw.comment_count ?? 0,
    downloads: raw.download_count ?? 0,
  };
}

// --- Raw SoundCloud responses (only the fields we use) ---

interface RawUser {
  id: number;
  kind?: string;
  /** The name from the address. */
  permalink: string;
  /** The name shown on the profile. */
  username: string | null;
  avatar_url: string | null;
  permalink_url: string;
  followers_count?: number | null;
}

export interface RawTrack {
  id: number;
  title: string;
  permalink_url: string;
  artwork_url?: string | null;
  sharing?: string;
  public?: boolean;
  created_at: string;
  duration?: number | null;
  genre?: string | null;
  playback_count?: number | null;
  likes_count?: number | null;
  reposts_count?: number | null;
  comment_count?: number | null;
  download_count?: number | null;
}

interface RawPage {
  collection?: RawTrack[];
  next_href?: string | null;
}
