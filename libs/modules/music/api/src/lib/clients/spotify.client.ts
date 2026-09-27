import { NowPlaying } from '@pd/contracts';

const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';

/** Read-only: what is playing now. */
export const SPOTIFY_SCOPES = 'user-read-currently-playing';

export interface SpotifyTokens {
  accessToken: string;
  /** Spotify may send a new refresh token — then the old one is no longer needed. */
  refreshToken: string | null;
  expiresAt: Date;
}

export class SpotifyAuthError extends Error {}

/** OAuth (Authorization Code flow) and reading the current track. */
export class SpotifyClient {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
  ) {}

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      scope: SPOTIFY_SCOPES,
      redirect_uri: this.redirectUri,
      state,
    });
    return `${ACCOUNTS}/authorize?${params}`;
  }

  exchangeCode(code: string): Promise<SpotifyTokens> {
    return this.requestToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    });
  }

  refresh(refreshToken: string): Promise<SpotifyTokens> {
    return this.requestToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  /** The current track, or `null` if nothing is playing. */
  async currentlyPlaying(accessToken: string): Promise<NowPlaying | null> {
    const response = await fetch(`${API}/me/player/currently-playing`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 204) {
      return null;
    }
    if (response.status === 401) {
      throw new SpotifyAuthError('Spotify access token expired');
    }
    if (!response.ok) {
      throw new Error(`Spotify API ${response.status}`);
    }
    const data = (await response.json()) as RawCurrentlyPlaying;
    // Podcasts and ads come without an item — they are not shown.
    if (!data.item) {
      return null;
    }
    return {
      source: 'spotify',
      track: data.item.name,
      artist: data.item.artists.map((a) => a.name).join(', '),
      album: data.item.album?.name ?? null,
      imageUrl: data.item.album?.images[0]?.url ?? null,
      url: data.item.external_urls.spotify,
      isPlaying: data.is_playing,
      progressMs: data.progress_ms,
      durationMs: data.item.duration_ms,
    };
  }

  private async requestToken(body: Record<string, string>): Promise<SpotifyTokens> {
    const response = await fetch(`${ACCOUNTS}/api/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams(body),
    });
    if (response.status === 400 || response.status === 401) {
      throw new SpotifyAuthError(`Spotify token request failed: ${await response.text()}`);
    }
    if (!response.ok) {
      throw new Error(`Spotify accounts ${response.status}`);
    }
    const data = (await response.json()) as RawToken;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }
}

interface RawToken {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

interface RawCurrentlyPlaying {
  is_playing: boolean;
  progress_ms: number | null;
  item: {
    name: string;
    duration_ms: number;
    artists: { name: string }[];
    album?: { name: string; images: { url: string }[] };
    external_urls: { spotify: string };
  } | null;
}
