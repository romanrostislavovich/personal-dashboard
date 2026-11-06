import {DailyMetric} from '@pd/contracts';
import {sql} from 'drizzle-orm';
import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {ChangePointsService, EVEN_DAY} from './change-points.service';
import {daysOf, shift} from './daily-series';

/** Needs PostgreSQL, see `sync-store.db.spec.ts` for how to run it. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../apps/api/migrations',
);
const DB_NAME = `links_changes_test_${process.pid}`;

// A Friday, and the Monday after it.
const NOW = new Date('2026-11-06T12:00:00Z');
const TODAY = '2026-11-06';
const MONDAY = new Date('2026-11-09T09:00:00Z');

/** A number of a year that steps up `daysAgo` days before today. */
function stepped(
  key: string,
  daysAgo: number,
  more: Partial<DailyMetric> = {},
): DailyMetric {
  const days = daysOf({from: shift(TODAY, -365), to: shift(TODAY, -1)});
  const at = days.length - daysAgo;
  return {
    key,
    module: key.split('.')[0],
    labelKey: `${key.split('.')[0]}.links.${key}`,
    unit: 'hours',
    days: days.map((day, index) => ({
      day,
      value: (index < at ? 1 : 3) + ((index * 7919) % 13) / 26,
    })),
    ...more,
  };
}

/** A calm number of a year: nothing unusual on any day. */
function calm(key: string): DailyMetric {
  const days = daysOf({from: shift(TODAY, -365), to: shift(TODAY, -1)});
  return {
    key,
    module: key.split('.')[0],
    labelKey: key,
    unit: 'hours',
    days: days.map((day, index) => ({day, value: 2 + (index % 5) / 10})),
  };
}

describe.skipIf(!ADMIN_URL)('ChangePointsService', () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let metrics: DailyMetric[] = [];
  let hidden: string[] = [];

  const service = () =>
    new ChangePointsService(
      db as never,
      {dailyMetrics: async () => metrics} as never,
      {findById: async () => ({}), timeZoneOf: () => 'UTC'} as never,
      {register: () => undefined} as never,
      {register: () => undefined} as never,
      {hiddenFromShared: async () => hidden} as never,
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

  it('keeps a change, and keeps its id when it is found a few days off', async () => {
    const user = await addUser();
    metrics = [stepped('activity.phone.night', 10)];
    await service().refresh(user, NOW);
    const [first] = (await service().list(user)).changes;
    expect(first).toMatchObject({
      key: 'activity.phone.night',
      module: 'activity',
    });

    // The next night the same step is placed two days off: the same change.
    metrics = [stepped('activity.phone.night', 12)];
    await service().refresh(user, new Date('2026-11-07T12:00:00Z'));
    const [again] = (await service().list(user)).changes;
    expect(again.id).toBe(first.id);
  });

  it('tells the digest of fresh main changes on Mondays only, without hidden sections', async () => {
    const user = await addUser();
    metrics = [
      stepped('activity.unlocks', 9),
      stepped('diary.mood', 5, {unit: 'score'}),
      stepped('vpn.megabytes', 5, {extra: true}),
    ];
    await service().refresh(user, NOW);
    expect(await service().digestFacts(user, NOW)).toBeNull();

    hidden = ['diary'];
    const facts = (await service().digestFacts(user, MONDAY)) as {
      key: string;
    }[];
    expect(facts.map(fact => fact.key)).toEqual(['activity.unlocks']);
    hidden = [];

    // Changes within a week of each other know of each other.
    const {changes} = await service().list(user);
    const mood = changes.find(change => change.key === 'diary.mood');
    expect(mood?.near).toHaveLength(2);
  });

  it('drops a change no longer found; counts only own changes opened, once', async () => {
    const user = await addUser();
    metrics = [stepped('health.steps', 40)];
    await service().refresh(user, NOW);
    const [change] = (await service().list(user)).changes;

    await service().seen(user, {kind: 'change', key: change.id});
    await service().seen(user, {kind: 'change', key: change.id});
    // Not a change of this user: not counted.
    await service().seen(user, {kind: 'change', key: randomUUID()});
    await service().seen(user, {kind: 'dose', key: 'a|b|0'});
    expect(await service().seenCount(user, 'change')).toBe(1);
    expect(await service().seenCount(user, 'dose')).toBe(1);

    metrics = [];
    await service().refresh(user, NOW);
    expect((await service().list(user)).changes).toEqual([]);
  });

  it('keeps an even day only when enough numbers had nothing unusual', async () => {
    const user = await addUser();
    metrics = Array.from({length: 9}, (_, index) => calm(`activity.n${index}`));
    await service().refresh(user, NOW);
    expect(await service().seenCount(user, EVEN_DAY)).toBe(0);

    metrics = Array.from({length: 10}, (_, index) =>
      calm(`activity.n${index}`),
    );
    await service().refresh(user, NOW);
    expect(await service().seenCount(user, EVEN_DAY)).toBe(1);
  });
});
