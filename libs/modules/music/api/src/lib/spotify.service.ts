import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, SecretsService, ServerKeysService } from '@pd/api-core';
import { NowPlaying } from '@pd/contracts';
import { randomBytes } from 'node:crypto';
import { SpotifyAuthError, SpotifyClient, SpotifyTokens } from './clients/spotify.client';

const REFRESH_TOKEN_SECRET = 'music.spotify.refresh-token';
const STATE_TTL_MS = 10 * 60 * 1000;
/** Refresh the access token ahead of time so it does not expire mid-request. */
const TOKEN_EXPIRY_MARGIN_MS = 60 * 1000;

/**
 * Spotify: OAuth connection and "now playing".
 *
 * 1. `connectUrl()` — the Spotify sign-in page URL (with a one-time `state`).
 * 2. Spotify sends the user back to `/api/music/spotify/callback?code&state`.
 * 3. `handleCallback()` exchanges the code for tokens; the refresh token is stored encrypted.
 */
@Injectable()
export class SpotifyService {
  /** Made from the app's keys the owner set (Settings → Integrations), again when they change. */
  private app: { keys: string; client: SpotifyClient } | null = null;
  private readonly publicUrl: string;
  // One-time states and access tokens live in memory — enough for a single API instance.
  private readonly pendingStates = new Map<string, { userId: string; expiresAt: number }>();
  private readonly accessTokens = new Map<string, SpotifyTokens>();
  /** The app's own token, for the search of the catalogue. */
  private appToken: SpotifyTokens | null = null;

  constructor(
    @Inject(ConfigService) config: AppConfig,
    private readonly secrets: SecretsService,
    private readonly keys: ServerKeysService,
  ) {
    this.publicUrl = config.get('PUBLIC_URL', { infer: true }).replace(/\/+$/, '');
  }

  /** Where Spotify sends the user back: the Redirect URI of the app at developer.spotify.com. */
  get redirectUri(): string {
    return `${this.publicUrl}/api/music/spotify/callback`;
  }

  async isAvailable(): Promise<boolean> {
    return (await this.client()) !== null;
  }

  /** The app's Client ID, for the owner to see which app it is (the secret is never shown). */
  clientId(): Promise<string | null> {
    return this.keys.get('music.spotify-client-id');
  }

  /** The owner sets the app's keys: Spotify must give the app its token with them first. */
  async setApp(clientId: string, clientSecret: string): Promise<void> {
    await new SpotifyClient(clientId, clientSecret, this.redirectUri).appToken().catch(() => {
      throw new BadRequestException('Spotify does not accept this Client ID and Client Secret');
    });
    await this.keys.set('music.spotify-client-id', clientId);
    await this.keys.set('music.spotify-client-secret', clientSecret);
  }

  async removeApp(): Promise<void> {
    await this.keys.set('music.spotify-client-id', null);
    await this.keys.set('music.spotify-client-secret', null);
  }

  private async client(): Promise<SpotifyClient | null> {
    const [clientId, clientSecret] = await Promise.all([
      this.keys.get('music.spotify-client-id'),
      this.keys.get('music.spotify-client-secret'),
    ]);
    if (!clientId || !clientSecret) {
      return null;
    }
    const keys = `${clientId}:${clientSecret}`;
    if (this.app?.keys !== keys) {
      this.app = { keys, client: new SpotifyClient(clientId, clientSecret, this.redirectUri) };
      this.appToken = null;
      this.accessTokens.clear();
    }
    return this.app.client;
  }

  /**
   * The link of a song in Spotify, found with the app's own token (no user needed); `null` —
   * Spotify is not set up on the server, or the song is not there.
   */
  async findTrack(track: string, artist: string | null): Promise<string | null> {
    const client = await this.client();
    if (!client) {
      return null;
    }
    if (!this.appToken || this.appToken.expiresAt.getTime() < Date.now() + 60_000) {
      this.appToken = await client.appToken();
    }
    return client.findTrack(this.appToken.accessToken, track, artist);
  }

  isConnected(userId: string): Promise<boolean> {
    return this.secrets.has(userId, REFRESH_TOKEN_SECRET);
  }

  async connectUrl(userId: string): Promise<string> {
    const client = await this.client();
    if (!client) {
      throw new BadRequestException('Spotify is not configured on the server');
    }
    const state = randomBytes(16).toString('hex');
    this.pendingStates.set(state, { userId, expiresAt: Date.now() + STATE_TTL_MS });
    return client.authorizeUrl(state);
  }

  /** Returns the URL to redirect the browser to after Spotify sign-in. */
  async handleCallback(code: string | undefined, state: string | undefined): Promise<string> {
    const pending = state ? this.pendingStates.get(state) : undefined;
    if (state) {
      this.pendingStates.delete(state);
    }
    const client = await this.client();
    if (!client || !code || !pending || pending.expiresAt < Date.now()) {
      return `${this.publicUrl}/settings?tab=integrations&spotify=error`;
    }
    const tokens = await client.exchangeCode(code);
    await this.saveTokens(pending.userId, tokens);
    return `${this.publicUrl}/settings?tab=integrations&spotify=connected`;
  }

  async disconnect(userId: string): Promise<void> {
    this.accessTokens.delete(userId);
    await this.secrets.delete(userId, REFRESH_TOKEN_SECRET);
  }

  async nowPlaying(userId: string): Promise<NowPlaying | null> {
    const client = await this.client();
    if (!client) {
      return null;
    }
    const accessToken = await this.accessToken(userId, client);
    if (!accessToken) {
      return null;
    }
    try {
      return await client.currentlyPlaying(accessToken);
    } catch (error) {
      if (error instanceof SpotifyAuthError) {
        // The token was revoked or expired early — a new one will be obtained next time.
        this.accessTokens.delete(userId);
        return null;
      }
      throw error;
    }
  }

  private async accessToken(userId: string, client: SpotifyClient): Promise<string | null> {
    const cached = this.accessTokens.get(userId);
    if (cached && cached.expiresAt.getTime() - TOKEN_EXPIRY_MARGIN_MS > Date.now()) {
      return cached.accessToken;
    }
    const refreshToken = await this.secrets.get(userId, REFRESH_TOKEN_SECRET);
    if (!refreshToken) {
      return null;
    }
    try {
      const tokens = await client.refresh(refreshToken);
      await this.saveTokens(userId, tokens);
      return tokens.accessToken;
    } catch (error) {
      if (error instanceof SpotifyAuthError) {
        // The user revoked access in Spotify — treat Spotify as disconnected.
        await this.disconnect(userId);
        return null;
      }
      throw error;
    }
  }

  private async saveTokens(userId: string, tokens: SpotifyTokens): Promise<void> {
    this.accessTokens.set(userId, tokens);
    if (tokens.refreshToken) {
      await this.secrets.set(userId, REFRESH_TOKEN_SECRET, tokens.refreshToken);
    }
  }
}
