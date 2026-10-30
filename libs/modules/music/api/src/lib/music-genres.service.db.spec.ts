import {sql} from 'drizzle-orm';
import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {LastfmNotFoundError, LastfmTag} from './clients/lastfm.client';
import {MusicGenresService} from './music-genres.service';

/** Needs PostgreSQL, see `sync-store.db.spec.ts` in api-core for how to run it. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../apps/api/migrations',
);
const DB_NAME = `music_genres_test_${process.pid}`;

/** The tags Last.fm would give; an artist missing here is unknown to it. */
const TAGS: Record<string, LastfmTag[]> = {
  Oxxxymiron: [
    {name: 'Hip-Hop', count: 100},
    {name: 'russian', count: 60},
    {name: 'rap', count: 50},
  ],
  Moderat: [
    {name: 'electronic', count: 100},
    {name: 'seen live', count: 40},
  ],
};

describe.skipIf(!ADMIN_URL)('MusicGenresService', () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let service: MusicGenresService;
  const asked: string[] = [];

  const addUser = async () => {
    const id = randomUUID();
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name)
      VALUES (${id}, ${`${id}@test`}, 'hash', 'Test')`);
    return id;
  };

  const play = (userId: string, minutesAgo: number, artist: string) =>
    db.execute(sql`INSERT INTO music_scrobbles (user_id, played_at, artist, track)
      VALUES (${userId}, now() - make_interval(mins => ${minutesAgo}), ${artist},
        ${`track ${minutesAgo}`})`);

  beforeAll(async () => {
    admin = new Pool({connectionString: ADMIN_URL});
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${DB_NAME}`;
    pool = new Pool({connectionString: url.toString()});
    pool.on('error', () => undefined);
    db = drizzle({client: pool, casing: 'snake_case'});
    await migrate(db, {migrationsFolder: MIGRATIONS});
    const client = {
      getArtistTopTags: async (artist: string) => {
        asked.push(artist);
        const tags = TAGS[artist];
        if (!tags) {
          throw new LastfmNotFoundError(artist);
        }
        return tags;
      },
    };
    service = new MusicGenresService(
      db as never,
      {
        clientFor: async () => client,
      } as never,
    );
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await dropScratchDatabase(admin, DB_NAME);
    }
    await admin?.end();
  });

  it('reads the genres once per artist and tops the genres of a period', async () => {
    const userId = await addUser();
    for (const minutes of [1, 2, 3]) {
      await play(userId, minutes, 'Oxxxymiron');
    }
    await play(userId, 4, 'Moderat');
    await play(userId, 5, 'Nobody Knows');
    // Played ten days ago: out of a week, in all the history.
    await play(userId, 10 * 24 * 60, 'Moderat');

    await service.fill(userId);
    await service.fill(userId);

    expect(asked.sort()).toEqual(['Moderat', 'Nobody Knows', 'Oxxxymiron']);
    const week = await service.top(
      userId,
      new Date(Date.now() - 7 * 86_400_000),
    );
    expect(week).toEqual([
      {name: 'hip-hop', plays: 3, percent: 60},
      {name: 'rap', plays: 3, percent: 60},
      {name: 'electronic', plays: 1, percent: 20},
    ]);
    expect((await service.top(userId, null))[2]).toEqual({
      name: 'electronic',
      plays: 2,
      percent: 33,
    });
    const of = await service.of(userId, ['oxxxymiron', 'Nobody Knows']);
    expect(of.get('oxxxymiron')).toEqual(['hip-hop', 'rap']);
    expect(of.get('Nobody Knows')).toEqual([]);
    expect(await service.heard(userId, 2)).toBe(3);
  });
});

/** Waits for the closed connections to leave, then drops the scratch database. */
async function dropScratchDatabase(admin: Pool, name: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const {rows} = await admin.query<{open: number}>(
      'SELECT count(*)::int AS open FROM pg_stat_activity WHERE datname = $1',
      [name],
    );
    if (rows[0].open === 0) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
}
