import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, SecretsService } from '@pd/api-core';
import { NowPlaying } from '@pd/contracts';
import { randomBytes } from 'node:crypto';
import { SpotifyAuthError, SpotifyClient, SpotifyTokens } from './clients/spotify.client';

const REFRESH_TOKEN_SECRET = 'music.spotify.refresh-token';
const STATE_TTL_MS = 10 * 60 * 1000;
/** Обновляем access-токен заранее, чтобы он не истёк посреди запроса. */
const TOKEN_EXPIRY_MARGIN_MS = 60 * 1000;

/**
 * Spotify: подключение через OAuth и «сейчас играет».
 *
 * 1. `connectUrl()` — адрес страницы входа Spotify (с одноразовым `state`).
 * 2. Spotify возвращает пользователя на `/api/music/spotify/callback?code&state`.
 * 3. `handleCallback()` меняет code на токены; refresh-токен хранится зашифрованным.
 */
@Injectable()
export class SpotifyService {
  private readonly client: SpotifyClient | null;
  private readonly publicUrl: string;
  // Одноразовые state и access-токены живут в памяти — для одного инстанса API достаточно.
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

  /** Возвращает адрес, куда перенаправить браузер после входа в Spotify. */
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
        // Токен отозвали или он истёк раньше срока — в следующий раз получим новый.
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
        // Пользователь отозвал доступ в Spotify — считаем, что Spotify отключён.
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
