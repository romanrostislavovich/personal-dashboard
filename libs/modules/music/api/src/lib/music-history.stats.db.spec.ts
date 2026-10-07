import { sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from 'pg';
import { historyTopSchema, MusicHistoryQueryService } from './music-history.query';
import { MusicHistoryStatsService } from './music-history.stats';

/** Needs PostgreSQL, see `sync-store.db.spec.ts` in api-core for how to run it. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(import.meta.dirname, '../../../../../../apps/api/migrations');
const DB_NAME = `music_stats_test_${process.pid}`;

describe.skipIf(!ADMIN_URL)('MusicHistoryStatsService', () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let service: MusicHistoryStatsService;
  let history: MusicHistoryQueryService;

  const addUser = async () => {
    const id = randomUUID();
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name)
      VALUES (${id}, ${`${id}@test`}, 'hash', 'Test')`);
    return id;
  };

  /** `at` is UTC; the service counts days in Europe/Warsaw (UTC+2 in summer). */
  const play = (userId: string, at: string, artist: string, track: string, album = '') =>
    db.execute(sql`INSERT INTO music_scrobbles (user_id, played_at, artist, track, album)
      VALUES (${userId}, ${at}::timestamptz, ${artist}, ${track}, ${album})`);

  beforeAll(async () => {
    admin = new Pool({ connectionString: ADMIN_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${DB_NAME}`;
    pool = new Pool({ connectionString: url.toString() });
    // A connection closed by the database at the end must not become an unhandled error.
    pool.on('error', () => undefined);
    db = drizzle({ client: pool, casing: 'snake_case' });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    service = new MusicHistoryStatsService(db, { get: () => 'Europe/Warsaw' } as never);
    history = new MusicHistoryQueryService(db, { get: () => 'Europe/Warsaw' } as never);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await dropScratchDatabase(admin, DB_NAME);
    }
    await admin?.end();
  });

  it('counts plays, variety, days, streaks and records', async () => {
    const userId = await addUser();
    // Local days: Jul 1, 2, 3, (gap), 5, 6 — the longest streak is 3.
    await play(userId, '2026-07-01T10:00:00Z', 'A', 'one', 'first');
    await play(userId, '2026-07-01T11:00:00Z', 'A', 'one', 'first');
    await play(userId, '2026-07-01T12:00:00Z', 'A', 'two', 'first');
    await play(userId, '2026-07-02T10:00:00Z', 'B', 'three');
    // 23:30 UTC on Jul 2 is 01:30 on Jul 3 in Warsaw: a night play on Jul 3.
    await play(userId, '2026-07-02T23:30:00Z', 'B', 'four', 'second');
    await play(userId, '2026-07-05T10:00:00Z', 'C', 'five', 'third');
    await play(userId, '2026-07-06T10:00:00Z', 'A', 'one', 'first');

    expect(await service.stats(userId)).toMatchObject({
      plays: 7,
      artists: 3,
      tracks: 5,
      // Plays without an album do not count.
      albums: 3,
      listeningDays: 5,
      longestStreak: 3,
      maxPlaysInDay: 3,
      maxArtistPlays: 4,
      maxTrackPlays: 3,
      nightPlays: 1,
    });
  });

  describe('the top of the stored history', () => {
    const top = (userId: string, query: Record<string, unknown>) =>
      history.top(userId, historyTopSchema.parse(query));
    let userId: string;

    beforeAll(async () => {
      userId = await addUser();
      const plays: [string, string, string, string?][] = [
        ['2024-03-01T10:00:00Z', 'Muse', 'Hysteria', 'Absolution'],
        ['2024-03-02T10:00:00Z', 'Muse', 'Hysteria', 'Absolution'],
        ['2025-06-01T10:00:00Z', 'Muse', 'Hysteria', 'Absolution'],
        ['2024-03-03T10:00:00Z', 'Muse', 'Starlight', 'Black Holes and Revelations'],
        ['2025-06-02T10:00:00Z', 'Muse', 'Starlight', 'Black Holes and Revelations'],
        ['2025-06-03T10:00:00Z', 'Muse', 'Uprising'],
        ['2024-03-04T10:00:00Z', 'The Beatles', 'Yesterday', 'Help!'],
        // 23:30 UTC on Dec 31 is already Jan 1 in Warsaw.
        ['2024-12-31T23:30:00Z', 'The Beatles', 'Yesterday', 'Help!'],
      ];
      for (const [at, artist, track, album] of plays) {
        await play(userId, at, artist, track, album);
      }
      // Another user's plays never get into the answer.
      await play(await addUser(), '2025-01-01T10:00:00Z', 'Muse', 'Hysteria', 'Absolution');
    });

    it('names the most played tracks of an artist, whatever the case of the name', async () => {
      const result = await top(userId, { artist: 'muse', limit: 2 });
      expect(result.plays).toBe(6);
      expect(result.rows.map((row) => [row.track, row.plays])).toEqual([
        ['Hysteria', 3],
        ['Starlight', 2],
      ]);
      expect(result.rows[0].firstPlayedAt).toBe('2024-03-01T10:00:00.000Z');
      expect(result.rows[0].lastPlayedAt).toBe('2025-06-01T10:00:00.000Z');
    });

    it('finds an artist by a part of the name when nothing matches exactly', async () => {
      const result = await top(userId, { artist: 'beatles' });
      expect(result.rows).toMatchObject([{ artist: 'The Beatles', track: 'Yesterday', plays: 2 }]);
      // A name that matches exactly is not widened to the ones that contain it.
      await play(userId, '2025-07-01T10:00:00Z', 'Muse Tribute Band', 'Hysteria');
      expect((await top(userId, { artist: 'Muse' })).plays).toBe(6);
    });

    it('counts by artist and by album, a play without an album in none', async () => {
      const artists = await top(userId, { by: 'artist' });
      expect(artists.rows.slice(0, 2).map((row) => [row.artist, row.plays])).toEqual([
        ['Muse', 6],
        ['The Beatles', 2],
      ]);
      const albums = await top(userId, { by: 'album', artist: 'Muse' });
      expect(albums.plays).toBe(5);
      expect(albums.rows.map((row) => [row.album, row.plays])).toEqual([
        ['Absolution', 3],
        ['Black Holes and Revelations', 2],
      ]);
    });

    it('keeps to the days asked for, in the time zone of the user', async () => {
      const year = await top(userId, { artist: 'Muse', from: '2025-01-01', to: '2025-12-31' });
      expect(year.rows.map((row) => [row.track, row.plays])).toEqual([
        ['Hysteria', 1],
        ['Starlight', 1],
        ['Uprising', 1],
      ]);
      // The play at 23:30 UTC on Dec 31 belongs to 2025 in Warsaw.
      expect((await top(userId, { artist: 'The Beatles', from: '2025-01-01' })).plays).toBe(1);
      expect((await top(userId, { artist: 'The Beatles', to: '2024-12-31' })).plays).toBe(1);
    });

    it('answers with nothing for what was never played', async () => {
      expect(await top(userId, { artist: 'Nobody At All' })).toEqual({ plays: 0, rows: [] });
    });
  });

  it('is all zeros without plays', async () => {
    const userId = await addUser();
    expect(await service.stats(userId)).toEqual({
      plays: 0,
      nightPlays: 0,
      artists: 0,
      tracks: 0,
      albums: 0,
      listeningDays: 0,
      longestStreak: 0,
      maxPlaysInDay: 0,
      maxArtistPlays: 0,
      maxTrackPlays: 0,
      yearsSinceFirstPlay: 0,
    });
  });
});

/**
 * Drops a scratch database once our own connections to it are gone. `pool.end()` resolves while
 * they may still be closing, and dropping WITH (FORCE) then kills them: pg reports
 * "terminating connection due to administrator command" as an unhandled error (seen in CI).
 */
async function dropScratchDatabase(admin: Pool, name: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const { rows } = await admin.query<{ open: number }>(
      'SELECT count(*)::int AS open FROM pg_stat_activity WHERE datname = $1',
      [name],
    );
    if (rows[0].open === 0) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
}
