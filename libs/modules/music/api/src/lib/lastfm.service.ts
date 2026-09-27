import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, DB, Database, SecretsService } from '@pd/api-core';
import {
  LastfmSettingsInput,
  MusicStats,
  MusicTopPeriod,
  MusicTops,
  NowPlaying,
  todayIn,
} from '@pd/contracts';
import { and, desc, eq, gt, isNotNull, max, sql } from 'drizzle-orm';
import { LastfmAuthError, LastfmClient } from './clients/lastfm.client';
import { musicSettings, MusicSettingsRow, scrobbles } from './music.schema';
import { fillPlaysByDay } from './plays-by-day';

const API_KEY_SECRET = 'music.lastfm.api-key';
/** При подключении подтягиваем историю за последние 30 дней, а не всю. */
const INITIAL_HISTORY_DAYS = 30;
/** Ограничение на одну синхронизацию: 25 страниц × 200 = 5000 прослушиваний. */
const MAX_PAGES_PER_SYNC = 25;
const STATS_DAYS = 30;
const RECENT_LIMIT = 10;
/** Топы и общий счётчик меняются медленно — кэшируем, чтобы не упираться в лимиты Last.fm. */
const CACHE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class LastfmService {
  private readonly logger = new Logger(LastfmService.name);
  private readonly cache = new Map<string, { expiresAt: number; value: unknown }>();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly secrets: SecretsService,
  ) {}

  async getSettings(userId: string): Promise<MusicSettingsRow | undefined> {
    const [row] = await this.db
      .select()
      .from(musicSettings)
      .where(eq(musicSettings.userId, userId));
    return row;
  }

  /** Подключение: проверяем пару «пользователь + ключ» и сразу подтягиваем историю. */
  async connect(userId: string, { username, apiKey }: LastfmSettingsInput): Promise<void> {
    try {
      await new LastfmClient(apiKey, username).getTotalScrobbles();
    } catch (error) {
      if (error instanceof LastfmAuthError) {
        throw new BadRequestException('Invalid Last.fm username or API key');
      }
      throw error;
    }
    await this.secrets.set(userId, API_KEY_SECRET, apiKey);
    await this.db
      .insert(musicSettings)
      .values({ userId, lastfmUsername: username })
      .onConflictDoUpdate({
        target: musicSettings.userId,
        set: { lastfmUsername: username, lastError: null },
      });
    this.clearCache(userId);
    await this.sync(userId);
  }

  /** Отключение. Уже загруженная история остаётся — она нужна статистике. */
  async disconnect(userId: string): Promise<void> {
    await this.secrets.delete(userId, API_KEY_SECRET);
    await this.db
      .update(musicSettings)
      .set({ lastfmUsername: null, lastError: null })
      .where(eq(musicSettings.userId, userId));
    this.clearCache(userId);
  }

  /** Докачивает новые прослушивания в локальную историю. */
  async sync(userId: string): Promise<void> {
    const client = await this.clientFor(userId);
    if (!client) {
      return;
    }
    try {
      const [{ latest }] = await this.db
        .select({ latest: max(scrobbles.playedAt) })
        .from(scrobbles)
        .where(eq(scrobbles.userId, userId));
      const from = latest ?? new Date(Date.now() - INITIAL_HISTORY_DAYS * 24 * 60 * 60 * 1000);

      for (let page = 1; page <= MAX_PAGES_PER_SYNC; page++) {
        const result = await client.getRecentTracks({ from, page });
        const played = result.tracks.filter((t) => t.playedAt !== null);
        if (played.length > 0) {
          await this.db
            .insert(scrobbles)
            .values(
              played.map((t) => ({
                userId,
                playedAt: t.playedAt as Date,
                artist: t.artist,
                track: t.track,
                album: t.album,
              })),
            )
            .onConflictDoNothing();
        }
        if (page >= result.totalPages) {
          break;
        }
      }
      await this.setSyncResult(userId, null);
    } catch (error) {
      this.logger.warn(`Last.fm sync failed for ${userId}: ${error}`);
      await this.setSyncResult(userId, error instanceof Error ? error.message : String(error));
    }
  }

  /** Все пользователи с подключённым Last.fm (для фоновой задачи). */
  async connectedUserIds(): Promise<string[]> {
    const rows = await this.db
      .select({ userId: musicSettings.userId })
      .from(musicSettings)
      .where(isNotNull(musicSettings.lastfmUsername));
    return rows.map((row) => row.userId);
  }

  async stats(userId: string): Promise<MusicStats> {
    const timeZone = this.config.get('APP_TIMEZONE', { infer: true });
    const today = todayIn(timeZone);
    const since = new Date(Date.now() - (STATS_DAYS + 1) * 24 * 60 * 60 * 1000);

    // День прослушивания считаем в часовом поясе пользователя, а не в UTC.
    const counts = await this.db
      .select({
        day: sql<string>`to_char(${scrobbles.playedAt} AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`,
        plays: sql<number>`count(*)::int`,
      })
      .from(scrobbles)
      .where(and(eq(scrobbles.userId, userId), gt(scrobbles.playedAt, since)))
      .groupBy(sql`1`);
    const playsByDay = fillPlaysByDay(counts, today, STATS_DAYS);

    const recent = await this.db
      .select()
      .from(scrobbles)
      .where(eq(scrobbles.userId, userId))
      .orderBy(desc(scrobbles.playedAt))
      .limit(RECENT_LIMIT);

    const client = await this.clientFor(userId);
    const totalScrobbles = client
      ? await this.cached(userId, 'total', () => client.getTotalScrobbles()).catch(() => null)
      : null;

    return {
      totalScrobbles,
      today: playsByDay.at(-1)?.plays ?? 0,
      playsByDay,
      recent: recent.map((r) => ({
        track: r.track,
        artist: r.artist,
        album: r.album,
        playedAt: r.playedAt.toISOString(),
      })),
    };
  }

  async tops(userId: string, period: MusicTopPeriod): Promise<MusicTops | null> {
    const client = await this.clientFor(userId);
    if (!client) {
      return null;
    }
    return this.cached(userId, `tops:${period}`, async () => {
      const [artists, tracks, albums] = await Promise.all([
        client.getTop('artists', period),
        client.getTop('tracks', period),
        client.getTop('albums', period),
      ]);
      return { period, artists, tracks, albums };
    });
  }

  /** «Сейчас играет» по данным Last.fm (если плеер скробблит). */
  async nowPlaying(userId: string): Promise<NowPlaying | null> {
    const client = await this.clientFor(userId);
    if (!client) {
      return null;
    }
    const { tracks } = await client.getRecentTracks({ limit: 1 });
    const current = tracks.find((t) => t.playedAt === null);
    return current
      ? {
          source: 'lastfm',
          track: current.track,
          artist: current.artist,
          album: current.album,
          imageUrl: current.imageUrl,
          url: current.url,
          isPlaying: true,
          progressMs: null,
          durationMs: null,
        }
      : null;
  }

  private async clientFor(userId: string): Promise<LastfmClient | null> {
    const settings = await this.getSettings(userId);
    const apiKey = await this.secrets.get(userId, API_KEY_SECRET);
    return settings?.lastfmUsername && apiKey
      ? new LastfmClient(apiKey, settings.lastfmUsername)
      : null;
  }

  private async setSyncResult(userId: string, lastError: string | null): Promise<void> {
    await this.db
      .update(musicSettings)
      .set({ lastSyncedAt: new Date(), lastError })
      .where(eq(musicSettings.userId, userId));
  }

  private async cached<T>(userId: string, key: string, load: () => Promise<T>): Promise<T> {
    const cacheKey = `${userId}:${key}`;
    const hit = this.cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value as T;
    }
    const value = await load();
    this.cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return value;
  }

  private clearCache(userId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.cache.delete(key);
      }
    }
  }
}
