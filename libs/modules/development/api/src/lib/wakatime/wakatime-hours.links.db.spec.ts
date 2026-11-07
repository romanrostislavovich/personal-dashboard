import {HourlySource} from '@pd/api-core';
import {sql} from 'drizzle-orm';
import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {WakatimeHoursLinks} from './wakatime-hours.links';
import {WakatimeSpansService} from './wakatime-spans.service';

/** Coding hour by hour from WakaTime's stretches, by the user's own clock. Needs PostgreSQL. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../../apps/api/migrations',
);
const DATABASE = `wakatime_hours_test_${process.pid}`;
const TZ = 'Europe/Warsaw';

describe.skipIf(!ADMIN_URL)('the coding hours', {timeout: 60_000}, () => {
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
    new WakatimeHoursLinks(
      links as never,
      new WakatimeSpansService(db as never),
    ).onModuleInit();
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin?.end();
  });

  async function span(user: string, name: string, from: string, to: string) {
    await db.execute(sql`INSERT INTO wakatime_spans (user_id, kind, name, started_at, ended_at, day)
      VALUES (${user}, 'project', ${name}, ${from}, ${to}, '2026-11-02')`);
  }

  it("spreads the coding over the local hours, what overlaps once, another user's not", async () => {
    // 23:30–00:45 UTC is 00:30–01:45 in Warsaw on the 2nd; another project overlaps it.
    await span(userId, 'site', '2026-11-01T23:30:00Z', '2026-11-02T00:45:00Z');
    await span(userId, 'api', '2026-11-02T00:00:00Z', '2026-11-02T00:30:00Z');
    await span(otherId, 'site', '2026-11-02T10:00:00Z', '2026-11-02T11:00:00Z');
    const {metrics} = await hourly.hours(
      userId,
      {from: '2026-11-01', to: '2026-11-03'},
      TZ,
    );
    const [coding] = metrics;
    expect(coding.key).toBe('development.hour.coding');
    expect(coding.productive).toBe(true);
    expect(coding.hours).toEqual([
      {hour: '2026-11-02T00', value: 30},
      {hour: '2026-11-02T01', value: 45},
    ]);
    // From the first stretch to the last: the 1st and the 3rd are unknown, not zeros.
    expect(coding.days).toEqual(['2026-11-02']);
  });

  it('has no number without any stretch', async () => {
    const {metrics} = await hourly.hours(
      otherId,
      {from: '2026-10-01', to: '2026-10-02'},
      TZ,
    );
    expect(metrics).toEqual([]);
  });
});
