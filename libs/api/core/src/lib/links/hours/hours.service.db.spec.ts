import {HourlyMetric, LocalDate} from '@pd/contracts';
import {sql} from 'drizzle-orm';
import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {daysOf, shift} from '../daily-series';
import {HoursService, IN_WINDOW_DAY} from './hours.service';
import {hourOf, weekdayOf} from './local-hours';

/** Needs PostgreSQL, see `sync-store.db.spec.ts` for how to run it. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../../apps/api/migrations',
);
const DB_NAME = `links_hours_test_${process.pid}`;

// A Tuesday morning; yesterday was a Monday.
const NOW = new Date('2026-11-10T09:00:00Z');
const YESTERDAY = '2026-11-09';
const DAYS = daysOf({
  from: shift(YESTERDAY, -89),
  to: YESTERDAY,
}) as LocalDate[];

/** Deep work 10–12 on weekdays; `yesterday` — the hours of yesterday's. */
function deepWork(yesterday: number[]): HourlyMetric {
  return {
    key: 'activity.hour.deepWork',
    module: 'activity',
    labelKey: 'deep',
    unit: 'minutes',
    productive: true,
    days: DAYS,
    hours: DAYS.flatMap(day =>
      day === YESTERDAY
        ? yesterday.map(hour => ({hour: hourOf(day, hour), value: 45}))
        : weekdayOf(day) < 5
          ? [10, 11].map(hour => ({hour: hourOf(day, hour), value: 50}))
          : [],
    ),
  };
}

const steps: HourlyMetric = {
  key: 'health.hour.steps',
  module: 'health',
  labelKey: 'steps',
  unit: 'count',
  days: DAYS,
  hours: DAYS.map(day => ({hour: hourOf(day, 18), value: 3000})),
};

describe.skipIf(!ADMIN_URL)('HoursService', () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let metrics: HourlyMetric[] = [];

  const service = () =>
    new HoursService(
      db as never,
      {
        hours: async () => ({
          metrics,
          events: [
            {
              key: 'health.event.walk',
              module: 'health',
              labelKey: 'walk',
              days: DAYS,
              hours: [],
            },
          ],
        }),
      } as never,
      {findById: async () => ({}), timeZoneOf: () => 'UTC'} as never,
      {register: () => undefined} as never,
      {register: () => undefined} as never,
      {hiddenFromShared: async () => ['health']} as never,
    );

  const addUser = async () => {
    const id = randomUUID();
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name, locale)
      VALUES (${id}, ${`${id}@test`}, 'hash', 'Test', 'en')`);
    return id;
  };
  const inWindowDays = async (user: string) =>
    (
      await db.execute<{key: string}>(
        sql`SELECT key FROM links_seen WHERE user_id = ${user} AND kind = ${IN_WINDOW_DAY}`,
      )
    ).rows.map(row => row.key);

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
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin?.end();
  });

  it('keeps yesterday as "in my window" when its deep work went there, once', async () => {
    const user = await addUser();
    metrics = [deepWork([10, 11]), steps];
    await service().markInWindow(user, NOW);
    await service().markInWindow(user, NOW);
    expect(await inWindowDays(user)).toEqual([YESTERDAY]);
  });

  it('does not when the deep work went elsewhere', async () => {
    const user = await addUser();
    metrics = [deepWork([15, 16]), steps];
    await service().markInWindow(user, NOW);
    expect(await inWindowDays(user)).toEqual([]);
  });

  it('tells the window of today and leaves the hidden sections out', async () => {
    const user = await addUser();
    metrics = [deepWork([10, 11]), steps];
    const window = await service().window(user, ['health'], NOW);
    expect(window.weekday).toBe(1);
    expect(window.week[1].windows).toEqual([{from: 10, to: 12}]);
    const rhythm = await service().rhythm(user, 90, undefined, ['health']);
    expect(rhythm.metrics.map(one => one.key)).toEqual([
      'activity.hour.deepWork',
    ]);
    // The digest's AI does not see Health; the window is of deep work only.
    expect(await service().digestFacts(user, NOW)).toEqual({
      windows: [{from: 10, to: 12}],
      sure: 'high',
    });
  });

  it('knows the keys of the hourly numbers and events, not made-up ones', async () => {
    const user = await addUser();
    metrics = [steps];
    expect(await service().knows(user, 'rhythm', 'health.hour.steps')).toBe(
      true,
    );
    expect(await service().knows(user, 'after', 'health.event.walk')).toBe(
      true,
    );
    expect(await service().knows(user, 'rhythm', 'nothing.here')).toBe(false);
  });
});
