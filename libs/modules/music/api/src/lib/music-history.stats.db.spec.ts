import { sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from 'pg';
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
