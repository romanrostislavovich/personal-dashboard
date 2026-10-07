import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, contains, DB, Database } from '@pd/api-core';
import { and, count, desc, eq, max, min, SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { scrobbles } from './music.schema';

/** What the plays are counted by. */
export const HISTORY_GROUPS = ['track', 'artist', 'album'] as const;

export const historyTopSchema = z.object({
  by: z.enum(HISTORY_GROUPS).default('track'),
  /** Only the plays of this artist / track / album; the case does not matter. */
  artist: z.string().trim().min(1).max(200).optional(),
  track: z.string().trim().min(1).max(200).optional(),
  album: z.string().trim().min(1).max(200).optional(),
  /** Days of the user, inclusive; without them — the whole history. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  limit: z.number().int().min(1).max(50).default(10),
});
export type HistoryTopQuery = z.output<typeof historyTopSchema>;

export interface HistoryTopRow {
  artist: string;
  /** Present when counted by track. */
  track?: string;
  /** Present when counted by album. */
  album?: string;
  plays: number;
  firstPlayedAt: string;
  lastPlayedAt: string;
}

export interface HistoryTop {
  /** All plays that match the filters, not only those of the rows returned. */
  plays: number;
  rows: HistoryTopRow[];
}

/**
 * Questions to the stored play history (`music_scrobbles`): the most played tracks, artists or
 * albums among the plays that match — "my top songs of Muse", "what I listened to in 2024".
 * Last.fm's own tops cannot answer these: they are the overall first few of a fixed period.
 */
@Injectable()
export class MusicHistoryQueryService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  async top(userId: string, query: HistoryTopQuery): Promise<HistoryTop> {
    // A name as the user (or the model) writes it: exact first, a part of the name otherwise
    // ("beatles" finds "The Beatles") — but an exact match is never widened.
    const exact = await this.count(userId, query, false);
    const loose = exact.plays === 0 && Boolean(query.artist ?? query.track ?? query.album);
    return loose ? this.count(userId, query, true) : exact;
  }

  private async count(userId: string, query: HistoryTopQuery, loose: boolean): Promise<HistoryTop> {
    const s = scrobbles;
    const where = and(eq(s.userId, userId), ...this.filters(query, loose));
    const columns = {
      artist: [s.artist],
      track: [s.artist, s.track],
      album: [s.artist, s.album],
    }[query.by];
    // A play without an album belongs to no album.
    const grouped = query.by === 'album' ? and(where, sql`${s.album} <> ''`) : where;

    const [total] = await this.db.select({ plays: count() }).from(s).where(grouped);
    const rows = await this.db
      .select({
        artist: s.artist,
        ...(query.by === 'track' ? { track: s.track } : {}),
        ...(query.by === 'album' ? { album: s.album } : {}),
        plays: count(),
        firstPlayedAt: min(s.playedAt),
        lastPlayedAt: max(s.playedAt),
      })
      .from(s)
      .where(grouped)
      .groupBy(...columns)
      .orderBy(desc(count()), ...columns)
      .limit(query.limit);
    return {
      plays: total.plays,
      rows: rows.map((row) => ({
        ...row,
        firstPlayedAt: (row.firstPlayedAt as Date).toISOString(),
        lastPlayedAt: (row.lastPlayedAt as Date).toISOString(),
      })) as HistoryTopRow[],
    };
  }

  private filters(query: HistoryTopQuery, loose: boolean): SQL[] {
    const s = scrobbles;
    const named = (column: typeof s.artist | typeof s.track | typeof s.album, name: string) =>
      loose ? contains(column, name) : sql`lower(${column}) = lower(${name})`;
    // A day is the user's own: a play at 01:00 belongs to the day it was played in their zone.
    const day = sql`(${s.playedAt} AT TIME ZONE ${this.config.get('APP_TIMEZONE', { infer: true })})::date`;
    return [
      ...(query.artist ? [named(s.artist, query.artist)] : []),
      ...(query.track ? [named(s.track, query.track)] : []),
      ...(query.album ? [named(s.album, query.album)] : []),
      ...(query.from ? [sql`${day} >= ${query.from}::date`] : []),
      ...(query.to ? [sql`${day} <= ${query.to}::date`] : []),
    ];
  }
}
