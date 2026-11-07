import {HourlySource} from '@pd/api-core';
import {sql} from 'drizzle-orm';
import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {WearableHoursLinks} from './wearable-hours.links';

/** The band hour by hour: steps, pulse, stress and walks, by the user's own clock. Needs PostgreSQL. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../../apps/api/migrations',
);
const DATABASE = `wearable_hours_test_${process.pid}`;
const TZ = 'Europe/Warsaw';

describe.skipIf(!ADMIN_URL)('the band hours', {timeout: 60_000}, () => {
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
    };
    new WearableHoursLinks(db as never, links as never).onModuleInit();
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin?.end();
  });

  it("reads the steps, the pulse and the stress by the local hour, and the walks, not another user's", async () => {
    // 23:00 UTC on the 1st is midnight of the 2nd in Warsaw.
    await db.execute(sql`INSERT INTO health_band_hours (user_id, at, steps) VALUES
      (${userId}, '2026-11-01T23:00:00Z', 2000),
      (${userId}, '2026-11-02T09:00:00Z', 300),
      (${otherId}, '2026-11-02T09:00:00Z', 9000)`);
    await db.execute(sql`INSERT INTO health_band_minutes (user_id, at, bpm) VALUES
      (${userId}, '2026-11-02T09:01:00Z', 60),
      (${userId}, '2026-11-02T09:02:00Z', 70)`);
    await db.execute(sql`INSERT INTO health_band_stress_hours (user_id, at, score, rest_minutes)
      VALUES (${userId}, '2026-11-02T09:00:00Z', 40, 10)`);
    const {metrics, events} = await hourly.hours(
      userId,
      {from: '2026-11-01', to: '2026-11-02'},
      TZ,
    );
    const of = (key: string) => metrics.find(one => one.key === key);
    expect(of('health.hour.steps')?.hours).toHaveLength(2);
    expect(of('health.hour.steps')?.hours).toEqual(
      expect.arrayContaining([
        {hour: '2026-11-02T00', value: 2000},
        {hour: '2026-11-02T10', value: 300},
      ]),
    );
    expect(of('health.hour.pulse')?.hours).toEqual([
      {hour: '2026-11-02T10', value: 65},
    ]);
    expect(of('health.hour.stress')?.unit).toBe('score');
    // The 1st was not worn: unknown, not a day of zeros.
    expect(of('health.hour.steps')?.days).toEqual(['2026-11-02']);
    expect(events[0].hours).toEqual(['2026-11-02T00']);
  });

  it('tells nothing of a band never worn', async () => {
    const {metrics, events} = await hourly.hours(
      randomUUID(),
      {from: '2026-11-01', to: '2026-11-02'},
      TZ,
    );
    expect(metrics).toEqual([]);
    expect(events).toEqual([]);
  });
});
