import {HourlySource} from '@pd/api-core';
import {sql} from 'drizzle-orm';
import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {MusicLinks} from './music.links';

/** The plays hour by hour and the hours music starts, by the user's own clock. Needs PostgreSQL. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../apps/api/migrations',
);
const DATABASE = `music_hours_test_${process.pid}`;
const TZ = 'Europe/Warsaw';

describe.skipIf(!ADMIN_URL)('the music hours', {timeout: 60_000}, () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let hourly: HourlySource;
  const userId = randomUUID();
  const otherId = randomUUID();

  beforeAll(async () => {
    admin = new Pool({connectionString: ADMIN_URL});
    await admin.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DATABASE}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${DATABASE}`;
    pool = new Pool({connectionString: url.toString()});
    pool.on('error', () => undefined);
    db = drizzle({client: pool, casing: 'snake_case'});
    await migrate(db, {migrationsFolder: MIGRATIONS});
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name)
      VALUES (${userId}, ${`${userId}@test`}, 'x', 'Test'),
             (${otherId}, ${`${otherId}@test`}, 'x', 'Other')`);
    const links = {
      registerHourly: (source: HourlySource) => (hourly = source),
      registerDailyMetrics: () => undefined,
      registerMoments: () => undefined,
      registerUsage: () => undefined,
      registerProject: () => undefined,
      registerPages: () => undefined,
    };
    new MusicLinks(
      db as never,
      links as never,
      {findById: async () => ({}), timeZoneOf: () => TZ} as never,
      {} as never,
    ).onModuleInit();
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin?.end();
  });

  it('counts the plays by the local hour and marks where music starts after quiet', async () => {
    await db.execute(sql`INSERT INTO music_scrobbles (user_id, played_at, artist, track) VALUES
      (${userId}, '2026-11-01T23:10:00Z', 'A', '1'),
      (${userId}, '2026-11-01T23:14:00Z', 'A', '2'),
      (${userId}, '2026-11-02T09:00:00Z', 'B', '3'),
      (${otherId}, '2026-11-02T09:00:00Z', 'C', '4')`);
    const {metrics, events} = await hourly.hours(
      userId,
      {from: '2026-11-01', to: '2026-11-03'},
      TZ,
    );
    expect(metrics[0].hours).toHaveLength(2);
    expect(metrics[0].hours).toEqual(
      expect.arrayContaining([
        {hour: '2026-11-02T00', value: 2},
        {hour: '2026-11-02T10', value: 1},
      ]),
    );
    // Music began at 00 and again at 10, after hours of quiet.
    expect([...events[0].hours].sort()).toEqual([
      '2026-11-02T00',
      '2026-11-02T10',
    ]);
    expect(metrics[0].days).toEqual(['2026-11-02']);
  });
});
