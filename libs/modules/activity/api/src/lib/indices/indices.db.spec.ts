import {DeviceAuthService} from '@pd/api-core';
import {sql} from 'drizzle-orm';
import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {DevicesService} from '../devices.service';
import {IndicesService} from './indices.service';

/** Links v2's indices counted from a real database and kept; like phone-usage.db.spec.ts. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../../apps/api/migrations',
);
const DB_NAME = `activity_indices_test_${process.pid}`;

describe.skipIf(!ADMIN_URL)("the days' indices", {timeout: 60_000}, () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let indices: IndicesService;
  let devices: DevicesService;
  const userId = randomUUID();

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
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name, locale, time_zone)
      VALUES (${userId}, 'indices@test', 'hash', 'Test', 'en', 'Europe/Warsaw')`);
    devices = new DevicesService(db as never, new DeviceAuthService());
    const users = {
      findById: async () => ({timeZone: 'Europe/Warsaw'}),
      timeZoneOf: (user: {timeZone: string}) => user.timeZone,
    };
    const activity = {chosenCategories: async () => new Map()};
    const links = {dailyMetric: async () => null};
    indices = new IndicesService(
      db as never,
      users as never,
      activity as never,
      links as never,
    );
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin?.end();
  });

  async function span(
    deviceId: string,
    app: string,
    at: string,
    minutes: number,
  ) {
    const start = new Date(at);
    const end = new Date(start.getTime() + minutes * 60_000);
    await db.execute(sql`INSERT INTO activity_spans
      (user_id, device_id, app, app_name, title, started_at, ended_at, seconds)
      VALUES (${userId}, ${deviceId}, ${app}, ${app}, '', ${start.toISOString()},
        ${end.toISOString()}, ${minutes * 60})`);
  }

  it("counts a day by the user's own clock, keeps it, and counts it again in place", async () => {
    const pc = await devices.register(userId, {
      name: 'PC',
      platform: 'windows',
    });
    const phone = await devices.register(userId, {
      name: 'Redmi',
      platform: 'android',
    });
    // 10:00–10:40 local in Warsaw (UTC+1 in November): deep work in the IDE.
    await span(pc.id, 'code', '2026-11-02T09:00:00.000Z', 40);
    // 23:30 local: a feed on the phone, the late night.
    await span(
      phone.id,
      'com.instagram.android',
      '2026-11-02T22:30:00.000Z',
      30,
    );

    const ids = async () =>
      (
        await db.execute<{id: string; key: string}>(
          sql`SELECT id, key FROM activity_day_indices WHERE day = '2026-11-02' ORDER BY key`,
        )
      ).rows;
    await indices.countDays(userId, 'Europe/Warsaw', ['2026-11-02']);
    const first = await ids();
    await indices.countDays(userId, 'Europe/Warsaw', ['2026-11-02']);
    // Counted again, the rows keep their ids: the synced table does not churn.
    expect(await ids()).toEqual(first);
    const kept = await indices.read(userId, {
      from: '2026-11-02',
      to: '2026-11-02',
    });
    expect(kept.get('deepWork')).toEqual([{day: '2026-11-02', value: 0.67}]);
    expect(kept.get('draining')?.[0].value).toBe(0.5);
    expect(kept.get('lateNight')?.[0].value).toBe(0.5);
    // Kept for the bedtime, never shown.
    expect(kept.has('_lastUse')).toBe(false);
    const [{count}] = (
      await db.execute<{count: number}>(
        sql`SELECT count(*)::int AS count FROM activity_day_indices WHERE key = 'deepWork'`,
      )
    ).rows;
    expect(count).toBe(1);
  });

  it('marks a day with nothing as counted, so the history moves on', async () => {
    await indices.countDays(userId, 'Europe/Warsaw', ['2026-10-30']);
    const [{count}] = (
      await db.execute<{count: number}>(
        sql`SELECT count(*)::int AS count FROM activity_day_indices
          WHERE day = '2026-10-30' AND key = '_counted'`,
      )
    ).rows;
    expect(count).toBe(1);
    expect(
      (await indices.read(userId, {from: '2026-10-30', to: '2026-10-30'})).size,
    ).toBe(0);
  });

  it('counts the history and the last week, for the users active lately', async () => {
    const [phone] = (await devices.list(userId)).filter(
      one => one.platform === 'android',
    );
    // A span of an hour ago: the user is active whatever the day the test runs on.
    await span(
      phone.id,
      'org.telegram.messenger',
      new Date(Date.now() - 3_600_000).toISOString(),
      5,
    );
    expect(await indices.activeUserIds()).toContain(userId);
    await indices.refresh(userId);
    const kept = await indices.read(userId, {
      from: '2026-11-02',
      to: '2026-11-02',
    });
    expect(kept.get('deepWork')?.[0].value).toBe(0.67);
  });

  it("leaves another user's days alone", async () => {
    const otherId = randomUUID();
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name, locale, time_zone)
      VALUES (${otherId}, 'other-indices@test', 'hash', 'Other', 'en', 'Europe/Warsaw')`);
    await indices.countDays(otherId, 'Europe/Warsaw', ['2026-11-02']);
    expect(
      (await indices.read(otherId, {from: '2026-11-02', to: '2026-11-02'}))
        .size,
    ).toBe(0);
    expect(
      (await indices.read(userId, {from: '2026-11-02', to: '2026-11-02'})).get(
        'deepWork',
      ),
    ).toHaveLength(1);
  });
});
