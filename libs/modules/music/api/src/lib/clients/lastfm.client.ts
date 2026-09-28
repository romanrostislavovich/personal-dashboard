import { MusicTopItem, MusicTopPeriod } from '@pd/contracts';

const API = 'https://ws.audioscrobbler.com/2.0/';

/** Last.fm error codes: https://www.last.fm/api/errorcodes */
const INVALID_API_KEY = 10;
const USER_NOT_FOUND = 6;

export class LastfmAuthError extends Error {}

type TopKind = 'artists' | 'tracks' | 'albums';

const TOP_METHODS: Record<TopKind, { method: string; listKey: string; itemKey: string }> = {
  artists: { method: 'user.getTopArtists', listKey: 'topartists', itemKey: 'artist' },
  tracks: { method: 'user.getTopTracks', listKey: 'toptracks', itemKey: 'track' },
  albums: { method: 'user.getTopAlbums', listKey: 'topalbums', itemKey: 'album' },
};

export interface LastfmTrack {
  track: string;
  artist: string;
  album: string | null;
  imageUrl: string | null;
  url: string;
  /** `null` for the track that is playing right now. */
  playedAt: Date | null;
}

export interface LastfmRecentPage {
  tracks: LastfmTrack[];
  totalPages: number;
}

/** Minimal Last.fm API client — only the methods the module needs. */
export class LastfmClient {
  constructor(
    private readonly apiKey: string,
    private readonly username: string,
  ) {}

  async getTotalScrobbles(): Promise<number> {
    const data = await this.call<{ user: { playcount: string } }>('user.getInfo');
    return Number(data.user.playcount);
  }

  /**
   * Plays after `from` and/or before `to` (unix seconds, as Last.fm takes them), newest first;
   * at most 200 per page.
   */
  async getRecentTracks(
    options: { from?: Date; to?: number; page?: number; limit?: number } = {},
  ): Promise<LastfmRecentPage> {
    const { from, to, page = 1, limit = 200 } = options;
    const data = await this.call<RawRecentTracks>('user.getRecentTracks', {
      limit: String(limit),
      page: String(page),
      ...(from ? { from: String(Math.floor(from.getTime() / 1000) + 1) } : {}),
      ...(to !== undefined ? { to: String(to) } : {}),
    });
    return {
      tracks: asArray(data.recenttracks.track).map(toTrack),
      totalPages: Number(data.recenttracks['@attr']?.totalPages ?? 1),
    };
  }

  async getTop(kind: TopKind, period: MusicTopPeriod, limit = 10): Promise<MusicTopItem[]> {
    const { method, listKey, itemKey } = TOP_METHODS[kind];
    const data = await this.call<Record<string, Record<string, RawTopItem[] | RawTopItem>>>(
      method,
      {
        period,
        limit: String(limit),
      },
    );
    // A response like { topartists: { artist: [...] } }.
    return asArray(data[listKey]?.[itemKey]).map((item): MusicTopItem => ({
      name: item.name,
      artist: item.artist
        ? typeof item.artist === 'string'
          ? item.artist
          : item.artist.name
        : null,
      playcount: Number(item.playcount),
      url: item.url,
      // Last.fm has long returned a placeholder instead of artist photos — images are shown only for tracks/albums.
      imageUrl: kind === 'artists' ? null : pickImage(item.image),
    }));
  }

  private async call<T>(method: string, params: Record<string, string> = {}): Promise<T> {
    const query = new URLSearchParams({
      method,
      user: this.username,
      api_key: this.apiKey,
      format: 'json',
      ...params,
    });
    const response = await fetch(`${API}?${query}`, {
      headers: { 'User-Agent': 'personal-dashboard' },
    });
    const data = (await response.json()) as T & { error?: number; message?: string };
    if (data.error === INVALID_API_KEY || data.error === USER_NOT_FOUND) {
      throw new LastfmAuthError(data.message ?? 'Last.fm authentication failed');
    }
    if (!response.ok || data.error) {
      throw new Error(`Last.fm ${method}: ${data.message ?? response.status}`);
    }
    return data;
  }
}

// --- Raw Last.fm responses (only the fields we use) ---

interface RawImage {
  size: string;
  '#text': string;
}

interface RawRecentTrack {
  name: string;
  url: string;
  artist: { '#text': string };
  album: { '#text': string };
  image: RawImage[];
  date?: { uts: string };
  '@attr'?: { nowplaying?: string };
}

interface RawRecentTracks {
  recenttracks: {
    track: RawRecentTrack[] | RawRecentTrack;
    '@attr'?: { totalPages: string };
  };
}

interface RawTopItem {
  name: string;
  playcount: string;
  url: string;
  artist?: { name: string } | string;
  image?: RawImage[];
}

function toTrack(raw: RawRecentTrack): LastfmTrack {
  return {
    track: raw.name,
    artist: raw.artist['#text'],
    album: raw.album['#text'] || null,
    imageUrl: pickImage(raw.image),
    url: raw.url,
    playedAt:
      raw['@attr']?.nowplaying === 'true' || !raw.date
        ? null
        : new Date(Number(raw.date.uts) * 1000),
  };
}

/** Last.fm returns an object instead of an array when there is a single item. */
function asArray<T>(value: T[] | T | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function pickImage(images: RawImage[] | undefined): string | null {
  const image = images?.find((i) => i.size === 'extralarge') ?? images?.at(-1);
  return image?.['#text'] || null;
}
