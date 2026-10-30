import {Inject, Injectable, Logger} from '@nestjs/common';
import {DB, Database} from '@pd/api-core';
import {LocalDate, MusicGenreShare, MusicTops} from '@pd/contracts';
import {sql} from 'drizzle-orm';
import {
  LastfmNotFoundError,
  LastfmUnavailableError,
} from './clients/lastfm.client';
import {LastfmService} from './lastfm.service';
import {genresFromTags} from './music-genres';
import {musicArtistGenres, scrobbles} from './music.schema';

/** Artists whose genres are read from Last.fm per run: one request each. */
const ARTISTS_PER_RUN = 30;
/** Genres shown in a top. */
const TOP_GENRES = 10;

/**
 * The genres of the music listened to. Spotify gives new apps no genres any more, so they are
 * the tags Last.fm listeners gave each artist (music-genres.ts), read once per artist, the most
 * played first, a portion at every sync. A play counts for each genre of its artist.
 */
@Injectable()
export class MusicGenresService {
  private readonly logger = new Logger(MusicGenresService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly lastfm: LastfmService,
  ) {}

  /** Reads the genres of the next artists that have none yet. */
  async fill(userId: string): Promise<void> {
    const client = await this.lastfm.clientFor(userId);
    if (!client) {
      return;
    }
    const {rows} = await this.db.execute<{artist: string}>(sql`
      SELECT s.artist FROM ${scrobbles} s
      WHERE s.user_id = ${userId} AND NOT EXISTS (
        SELECT 1 FROM ${musicArtistGenres} g
        WHERE g.user_id = s.user_id AND g.artist = s.artist)
      GROUP BY s.artist ORDER BY count(*) DESC LIMIT ${ARTISTS_PER_RUN}
    `);
    for (const {artist} of rows) {
      let genres: string[];
      try {
        genres = genresFromTags(await client.getArtistTopTags(artist));
      } catch (error) {
        if (error instanceof LastfmNotFoundError) {
          genres = [];
        } else if (error instanceof LastfmUnavailableError) {
          return; // The rest at the next sync.
        } else {
          this.logger.warn(`Genres of "${artist}" were not read: ${error}`);
          return;
        }
      }
      await this.db
        .insert(musicArtistGenres)
        .values({userId, artist, genres})
        .onConflictDoNothing();
    }
  }

  /**
   * The genres played most since `since` (all the history without it), with their share of all
   * the plays then.
   */
  async top(userId: string, since: Date | null): Promise<MusicGenreShare[]> {
    const after = since ? sql`AND s.played_at >= ${since}` : sql``;
    const {rows} = await this.db.execute<{name: string; plays: number}>(sql`
      SELECT g.genre AS name, count(*)::int AS plays
      FROM ${scrobbles} s
      JOIN ${musicArtistGenres} a ON a.user_id = s.user_id AND a.artist = s.artist
      CROSS JOIN LATERAL unnest(a.genres) AS g(genre)
      WHERE s.user_id = ${userId} ${after}
      GROUP BY g.genre ORDER BY plays DESC, name LIMIT ${TOP_GENRES}
    `);
    const {rows: total} = await this.db.execute<{plays: number}>(sql`
      SELECT count(*)::int AS plays FROM ${scrobbles} s
      WHERE s.user_id = ${userId} ${after}
    `);
    const all = total[0]?.plays ?? 0;
    return rows.map(row => ({
      ...row,
      percent: all ? Math.round((row.plays / all) * 100) : 0,
    }));
  }

  /** Genres listened to for real: with at least `plays` plays (for the achievements). */
  async heard(userId: string, plays: number): Promise<number> {
    const {rows} = await this.db.execute<{genres: number}>(sql`
      SELECT count(*)::int AS genres FROM (
        SELECT g.genre FROM ${scrobbles} s
        JOIN ${musicArtistGenres} a ON a.user_id = s.user_id AND a.artist = s.artist
        CROSS JOIN LATERAL unnest(a.genres) AS g(genre)
        WHERE s.user_id = ${userId}
        GROUP BY g.genre HAVING count(*) >= ${plays}
      ) heard
    `);
    return rows[0]?.genres ?? 0;
  }

  /** The genres of these artists (any case), by the name as given. */
  async of(userId: string, artists: string[]): Promise<Map<string, string[]>> {
    const names = [...new Set(artists.map(name => name.toLowerCase()))];
    if (!names.length) {
      return new Map();
    }
    const {rows} = await this.db.execute<{
      artist: string;
      genres: string[];
    }>(sql`
      SELECT lower(artist) AS artist, genres FROM ${musicArtistGenres}
      WHERE user_id = ${userId} AND lower(artist) = ANY(${`{${names.map(name => JSON.stringify(name)).join(',')}}`}::text[])
    `);
    const byName = new Map(rows.map(row => [row.artist, row.genres]));
    return new Map(
      artists.map(name => [name, byName.get(name.toLowerCase()) ?? []]),
    );
  }

  /** A top with the genres of its artists and of the period. */
  async withGenres(userId: string, tops: MusicTops): Promise<MusicTops> {
    const of = await this.of(userId, [
      ...tops.artists.map(item => item.name),
      ...[...tops.tracks, ...tops.albums].map(item => item.artist ?? ''),
    ]);
    const tag = <T extends {name: string; artist: string | null}>(
      item: T,
      artist: string,
    ) => ({...item, genres: of.get(artist) ?? []});
    return {
      ...tops,
      artists: tops.artists.map(item => tag(item, item.name)),
      tracks: tops.tracks.map(item => tag(item, item.artist ?? '')),
      albums: tops.albums.map(item => tag(item, item.artist ?? '')),
      genres: await this.top(userId, periodStart(tops.period)),
    };
  }

  /**
   * Plays of the period's main genres day by day, in the user's time zone: what goes with a
   * good day may be a genre (Links).
   */
  async daily(
    userId: string,
    from: Date,
    to: Date,
    timeZone: string,
    genres: number,
  ): Promise<{genre: string; days: {day: LocalDate; value: number}[]}[]> {
    const {rows} = await this.db.execute<{
      genre: string;
      day: LocalDate;
      plays: number;
    }>(sql`
      WITH plays AS (
        SELECT g.genre, to_char(s.played_at AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day
        FROM ${scrobbles} s
        JOIN ${musicArtistGenres} a ON a.user_id = s.user_id AND a.artist = s.artist
        CROSS JOIN LATERAL unnest(a.genres) AS g(genre)
        WHERE s.user_id = ${userId} AND s.played_at >= ${from} AND s.played_at < ${to}
      ), main AS (
        SELECT genre FROM plays GROUP BY genre ORDER BY count(*) DESC LIMIT ${genres}
      )
      SELECT genre, day, count(*)::int AS plays FROM plays
      WHERE genre IN (SELECT genre FROM main)
      GROUP BY genre, day
    `);
    const byGenre = new Map<string, {day: LocalDate; value: number}[]>();
    for (const row of rows) {
      byGenre.set(row.genre, [
        ...(byGenre.get(row.genre) ?? []),
        {day: row.day, value: row.plays},
      ]);
    }
    return [...byGenre].map(([genre, days]) => ({genre, days}));
  }
}

/** Where a Last.fm period starts; `null` — all the history. */
function periodStart(period: MusicTops['period']): Date | null {
  const days = {'7day': 7, '1month': 30, '12month': 365, overall: null}[period];
  return days === null ? null : new Date(Date.now() - days * 86_400_000);
}
