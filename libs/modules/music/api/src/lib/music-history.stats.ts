import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, DB, Database } from '@pd/api-core';
import { SQL, sql } from 'drizzle-orm';
import { scrobbles } from './music.schema';

/** Numbers over the stored play history (`music_scrobbles`) — the base for music achievements. */
export interface MusicHistoryStats {
  plays: number;
  artists: number;
  /** Different artist + track pairs. */
  tracks: number;
  /** Different artist + album pairs (plays without an album are not counted). */
  albums: number;
  listeningDays: number;
  /** The most days in a row with at least one play. */
  longestStreak: number;
  maxPlaysInDay: number;
  /** The most plays of a single artist / a single track. */
  maxArtistPlays: number;
  maxTrackPlays: number;
  /** Plays from midnight to 5 am. */
  nightPlays: number;
  yearsSinceFirstPlay: number;
}

/** Achievement metrics ask for the same numbers one by one — reuse them for a short while. */
const CACHE_MS = 30_000;
const NIGHT_ENDS_AT_HOUR = 5;
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

@Injectable()
export class MusicHistoryStatsService {
  private readonly cache = new Map<string, { at: number; stats: Promise<MusicHistoryStats> }>();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  stats(userId: string): Promise<MusicHistoryStats> {
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      return cached.stats;
    }
    const stats = this.load(userId);
    this.cache.set(userId, { at: Date.now(), stats });
    stats.catch(() => this.cache.delete(userId));
    return stats;
  }

  private async load(userId: string): Promise<MusicHistoryStats> {
    const s = scrobbles;
    const [{ firstPlayAt, ...totals }, days, artists, tracks, albums, longestStreak] =
      await Promise.all([
        this.totals(userId),
        this.groups(userId, sql`${this.localDay()}`),
        this.groups(userId, sql`${s.artist}`),
        this.groups(userId, sql`${s.artist}, ${s.track}`),
        this.groups(userId, sql`${s.artist}, ${s.album}`, sql`${s.album} <> ''`),
        this.longestStreak(userId),
      ]);
    return {
      ...totals,
      artists: artists.count,
      tracks: tracks.count,
      albums: albums.count,
      listeningDays: days.count,
      longestStreak,
      maxPlaysInDay: days.largest,
      maxArtistPlays: artists.largest,
      maxTrackPlays: tracks.largest,
      yearsSinceFirstPlay: firstPlayAt
        ? Math.floor((Date.now() - new Date(firstPlayAt).getTime()) / YEAR_MS)
        : 0,
    };
  }

  /** An aggregate without GROUP BY always returns exactly one row, even with no plays. */
  private async totals(userId: string) {
    const s = scrobbles;
    const result = await this.db.execute<{
      plays: number;
      nightPlays: number;
      firstPlayAt: string | null;
    }>(sql`
      SELECT
        count(*)::int AS "plays",
        count(*) FILTER (
          WHERE extract(hour FROM ${s.playedAt} AT TIME ZONE ${this.timeZone()}) < ${NIGHT_ENDS_AT_HOUR}
        )::int AS "nightPlays",
        min(${s.playedAt})::text AS "firstPlayAt"
      FROM ${s}
      WHERE ${s.userId} = ${userId}
    `);
    return result.rows[0];
  }

  /**
   * Plays grouped by day, artist, track…: how many groups there are and the biggest one.
   * (Grouping is much faster than `count(DISTINCT (a, b))` on a long history.)
   */
  private async groups(
    userId: string,
    groupBy: SQL,
    where: SQL = sql`true`,
  ): Promise<{ count: number; largest: number }> {
    const result = await this.db.execute<{ count: number; largest: number }>(sql`
      SELECT count(*)::int AS count, coalesce(max(plays), 0)::int AS largest FROM (
        SELECT count(*) AS plays FROM ${scrobbles}
        WHERE ${scrobbles.userId} = ${userId} AND ${where}
        GROUP BY ${groupBy}
      ) per_group
    `);
    return result.rows[0];
  }

  /** Days in a row: consecutive dates minus their row number give the same value (one run). */
  private async longestStreak(userId: string): Promise<number> {
    const result = await this.db.execute<{ value: number | null }>(sql`
      SELECT max(days)::int AS value FROM (
        SELECT count(*) AS days FROM (
          SELECT day - (row_number() OVER (ORDER BY day))::int AS run FROM (
            SELECT DISTINCT ${this.localDay()} AS day FROM ${scrobbles}
            WHERE ${scrobbles.userId} = ${userId}
          ) days
        ) runs
        GROUP BY run
      ) streaks
    `);
    return result.rows[0]?.value ?? 0;
  }

  /** Days are counted in the dashboard's time zone, like the daily chart. */
  private localDay() {
    return sql`(${scrobbles.playedAt} AT TIME ZONE ${this.timeZone()})::date`;
  }

  private timeZone(): string {
    return this.config.get('APP_TIMEZONE', { infer: true });
  }
}
