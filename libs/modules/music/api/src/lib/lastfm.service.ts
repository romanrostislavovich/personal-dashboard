import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
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
import { and, desc, eq, gt, isNotNull, max, min, sql } from 'drizzle-orm';
import {
  LastfmAuthError,
  LastfmClient,
  LastfmTrack,
  LastfmUnavailableError,
} from './clients/lastfm.client';
import { musicSettings, MusicSettingsRow, scrobbles } from './music.schema';
import { fillPlaysByDay } from './plays-by-day';
import { scrobbleId } from './scrobble-id';

const API_KEY_SECRET = 'music.lastfm.api-key';
/** On connect, pull the last 30 days of history, not all of it. */
const INITIAL_HISTORY_DAYS = 30;
/** Limit per sync: 25 pages × 200 = 5000 plays. */
const MAX_PAGES_PER_SYNC = 25;
const STATS_DAYS = 30;
const RECENT_LIMIT = 10;
/** Tops and the total count change slowly — cache them to stay within Last.fm limits. */
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

  /** Connect: check the "user + key" pair and pull the history right away. */
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
        // Another account (or a reconnect) — check again that the whole history is here.
        set: { lastfmUsername: username, lastError: null, historyImportedAt: null },
      });
    this.clearCache(userId);
    await this.sync(userId);
  }

  /** Disconnect. Already loaded history stays — statistics need it. */
  async disconnect(userId: string): Promise<void> {
    await this.secrets.delete(userId, API_KEY_SECRET);
    await this.db
      .update(musicSettings)
      .set({ lastfmUsername: null, lastError: null })
      .where(eq(musicSettings.userId, userId));
    this.clearCache(userId);
  }

  /** Fetches new plays into the local history. */
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
        await this.save(userId, result.tracks);
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

  /** All users with Last.fm connected (for the background job). */
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

    // The play day is computed in the user's time zone, not in UTC.
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

    return {
      totalScrobbles: await this.totalScrobbles(userId).catch(() => null),
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

  /** Total Last.fm scrobbles of all time; `null` if Last.fm is not connected. */
  async totalScrobbles(userId: string): Promise<number | null> {
    const client = await this.clientFor(userId);
    return client ? this.cached(userId, 'total', () => client.getTotalScrobbles()) : null;
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

  /** "Now playing" according to Last.fm (if the player scrobbles). */
  async nowPlaying(userId: string): Promise<NowPlaying | null> {
    const client = await this.clientFor(userId);
    if (!client) {
      return null;
    }
    // Asked every half a minute while the page is open: Last.fm stumbling is "nothing plays".
    const tracks = await client
      .getRecentTracks({ limit: 1 })
      .then((page) => page.tracks)
      .catch((error) => {
        if (error instanceof LastfmUnavailableError) {
          return [];
        }
        throw error;
      });
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

  /**
   * Stores finished plays (the one playing now has no time yet); already stored ones are skipped.
   * Returns how many plays the page had.
   */
  async save(userId: string, tracks: LastfmTrack[]): Promise<number> {
    const played = tracks.filter((t): t is LastfmTrack & { playedAt: Date } => t.playedAt !== null);
    if (played.length > 0) {
      await this.db
        .insert(scrobbles)
        .values(
          played.map((t) => ({
            id: scrobbleId(userId, t.playedAt, t.track),
            userId,
            playedAt: t.playedAt,
            artist: t.artist,
            track: t.track,
            album: t.album,
          })),
        )
        .onConflictDoNothing();
    }
    return played.length;
  }

  /** How many plays are stored locally — the progress of the history import. */
  async storedCount(userId: string): Promise<number> {
    return this.db.$count(scrobbles, eq(scrobbles.userId, userId));
  }

  /** The oldest stored play: the history import continues from there into the past. */
  async oldestPlay(userId: string): Promise<Date | null> {
    const [{ oldest }] = await this.db
      .select({ oldest: min(scrobbles.playedAt) })
      .from(scrobbles)
      .where(eq(scrobbles.userId, userId));
    return oldest;
  }

  async clientFor(userId: string): Promise<LastfmClient | null> {
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
    try {
      const value = await load();
      this.cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
      return value;
    } catch (error) {
      if (!(error instanceof LastfmUnavailableError)) {
        throw error;
      }
      // Last.fm's own trouble: what was read before is better than an error; without it the
      // page gets 503 — and the owner no alarm, there is nothing to fix here.
      if (hit) {
        return hit.value as T;
      }
      throw new ServiceUnavailableException(error.message);
    }
  }

  private clearCache(userId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.cache.delete(key);
      }
    }
  }
}
