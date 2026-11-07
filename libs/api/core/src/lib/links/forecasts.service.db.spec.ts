import {DailyMetric} from '@pd/contracts';
import {sql} from 'drizzle-orm';
import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {daysOf, shift} from './daily-series';
import {ForecastsService} from './forecasts.service';
import {linksForecasts} from './links.schema';

/** Needs PostgreSQL, see `sync-store.db.spec.ts` for how to run it. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../apps/api/migrations',
);
const DB_NAME = `links_forecasts_test_${process.pid}`;

const TODAY = '2026-11-06';
const MORNING = new Date('2026-11-06T07:00:00Z');
const NIGHT = new Date('2026-11-06T22:00:00Z');

/** A year of a number up to `to`; `value` of the day's index. */
function metric(
  key: string,
  value: (index: number) => number,
  more: Partial<DailyMetric> = {},
  to = TODAY,
): DailyMetric {
  const days = daysOf({from: shift(TODAY, -365), to});
  return {
    key,
    module: key.split('.')[0],
    labelKey: key,
    unit: 'count',
    days: days.map((day, index) => ({day, value: value(index)})),
    ...more,
  };
}

/** Sleep drives the next day's tasks; the mood follows the week. */
function life(): DailyMetric[] {
  const sleep = (index: number) => 5 + ((index * 7) % 5);
  return [
    metric('health.sleep', sleep, {unit: 'hours'}),
    metric('tasks.done', index => (index ? sleep(index - 1) - 4 : 1), {
      outcome: true,
    }),
    metric('diary.mood', index => 1 + (index % 5), {unit: 'score'}),
    metric('activity.steps', index => 3000 + ((index * 13) % 9) * 1000),
    metric('weather.temperature', index => index % 20, {unit: 'degrees'}),
  ];
}

describe.skipIf(!ADMIN_URL)('ForecastsService', () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let metrics: DailyMetric[] = [];

  const service = () =>
    new ForecastsService(
      db as never,
      {
        dailyMetrics: async () => metrics,
      } as never,
      {
        findById: async () => ({}),
        timeZoneOf: () => 'UTC',
        hiddenSections: () => [],
      } as never,
      {register: () => undefined} as never,
      {register: () => undefined} as never,
      {hiddenFromShared: async () => []} as never,
    );

  const addUser = async () => {
    const id = randomUUID();
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name, locale)
      VALUES (${id}, ${`${id}@test`}, 'hash', 'Test', 'en')`);
    return id;
  };

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

  it('keeps the morning forecasts once and reads them back without the history', async () => {
    const user = await addUser();
    metrics = life();
    await service().keepDue(user, MORNING);
    const rows = await db.select().from(linksForecasts);
    const mine = rows.filter(row => row.userId === user);
    // The bedtime has neither the band nor the phone here: not made.
    expect(mine.map(row => row.key).sort()).toEqual([
      'diary.mood',
      'tasks.done',
    ]);
    expect(mine.every(row => row.day === TODAY && row.made === 'morning')).toBe(
      true,
    );

    // Asked again: the bedtime and deep work are still missing, so it tries, but keeps no twin.
    const again = await service().keep(user, 'morning', MORNING);
    expect(again.filter(one => one.value !== null)).toHaveLength(2);
    const after = (await db.select().from(linksForecasts)).filter(
      row => row.userId === user,
    );
    expect(after).toHaveLength(2);
  });

  it('makes the evening ones only late and only in the morning hours the morning ones', async () => {
    const user = await addUser();
    metrics = life();
    await service().keepDue(user, new Date('2026-11-06T15:00:00Z'));
    expect(
      (await db.select().from(linksForecasts)).filter(
        row => row.userId === user,
      ),
    ).toHaveLength(0);
    await service().keepDue(user, NIGHT);
    const rows = (await db.select().from(linksForecasts)).filter(
      row => row.userId === user,
    );
    expect(rows.map(row => `${row.made} ${row.day}`)).toEqual([
      'evening 2026-11-07',
      'evening 2026-11-07',
    ]);
  });

  it('keeps only known main numbers as the chosen targets, the weather not', async () => {
    const user = await addUser();
    metrics = life();
    await service().setTargets(user, [
      'activity.steps',
      'weather.temperature',
      'nothing.here',
      'tasks.done',
    ]);
    const targets = await service().targets(user);
    expect(targets).toEqual([
      'links.bedtime',
      'activity.index.deepWork',
      'tasks.done',
      'diary.mood',
      'activity.steps',
    ]);
    expect(await service().chosenCount(user)).toBe(1);
  });

  it('lists the kept forecasts with what the days were', async () => {
    const user = await addUser();
    metrics = life();
    await service().keepDue(user, new Date('2026-11-05T07:00:00Z'));
    const list = await service().list(user, [], MORNING);
    expect(list.today).toBe(TODAY);
    expect(list.forecasts.map(one => one.key)).toEqual([
      'tasks.done',
      'diary.mood',
    ]);
    const yesterday = list.past.find(
      one => one.key === 'tasks.done' && one.day === '2026-11-05',
    );
    expect(yesterday?.actual).not.toBeNull();
    expect(list.candidates.map(one => one.key)).toEqual([
      'health.sleep',
      'activity.steps',
    ]);
    // Before 18:00 there is no forecast of tomorrow yet.
    expect(list.forecasts.every(one => one.day === TODAY)).toBe(true);
  });
});
