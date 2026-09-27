import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, SecretsService } from '@pd/api-core';
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
  private readonly client: SpotifyClient | null;
  private readonly publicUrl: string;
  // One-time states and access tokens live in memory — enough for a single API instance.
  private readonly pendingStates = new Map<string, { userId: string; expiresAt: number }>();
  private readonly accessTokens = new Map<string, SpotifyTokens>();

  constructor(
    @Inject(ConfigService) config: AppConfig,
    private readonly secrets: SecretsService,
  ) {
    this.publicUrl = config.get('PUBLIC_URL', { infer: true }).replace(/\/+$/, '');
    const clientId = config.get('SPOTIFY_CLIENT_ID', { infer: true });
    const clientSecret = config.get('SPOTIFY_CLIENT_SECRET', { infer: true });
    this.client =
      clientId && clientSecret
        ? new SpotifyClient(clientId, clientSecret, `${this.publicUrl}/api/music/spotify/callback`)
        : null;
  }

  get isAvailable(): boolean {
    return this.client !== null;
  }

  isConnected(userId: string): Promise<boolean> {
    return this.secrets.has(userId, REFRESH_TOKEN_SECRET);
  }

  connectUrl(userId: string): string {
    if (!this.client) {
      throw new BadRequestException('Spotify is not configured on the server');
    }
    const state = randomBytes(16).toString('hex');
    this.pendingStates.set(state, { userId, expiresAt: Date.now() + STATE_TTL_MS });
    return this.client.authorizeUrl(state);
  }

  /** Returns the URL to redirect the browser to after Spotify sign-in. */
  async handleCallback(code: string | undefined, state: string | undefined): Promise<string> {
    const pending = state ? this.pendingStates.get(state) : undefined;
    if (state) {
      this.pendingStates.delete(state);
    }
    if (!this.client || !code || !pending || pending.expiresAt < Date.now()) {
      return `${this.publicUrl}/music?spotify=error`;
    }
    const tokens = await this.client.exchangeCode(code);
    await this.saveTokens(pending.userId, tokens);
    return `${this.publicUrl}/music?spotify=connected`;
  }

  async disconnect(userId: string): Promise<void> {
    this.accessTokens.delete(userId);
    await this.secrets.delete(userId, REFRESH_TOKEN_SECRET);
  }

  async nowPlaying(userId: string): Promise<NowPlaying | null> {
    if (!this.client) {
      return null;
    }
    const accessToken = await this.accessToken(userId);
    if (!accessToken) {
      return null;
    }
    try {
      return await this.client.currentlyPlaying(accessToken);
    } catch (error) {
      if (error instanceof SpotifyAuthError) {
        // The token was revoked or expired early — a new one will be obtained next time.
        this.accessTokens.delete(userId);
        return null;
      }
      throw error;
    }
  }

  private async accessToken(userId: string): Promise<string | null> {
    const cached = this.accessTokens.get(userId);
    if (cached && cached.expiresAt.getTime() - TOKEN_EXPIRY_MARGIN_MS > Date.now()) {
      return cached.accessToken;
    }
    const refreshToken = await this.secrets.get(userId, REFRESH_TOKEN_SECRET);
    if (!refreshToken || !this.client) {
      return null;
    }
    try {
      const tokens = await this.client.refresh(refreshToken);
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
