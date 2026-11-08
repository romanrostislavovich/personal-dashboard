import {DailyMetric, LocalDate} from '@pd/contracts';
import {sql} from 'drizzle-orm';
import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {daysOf, shift} from '../daily-series';
import {LapseService} from './lapse.service';
import {OverloadService} from './overload.service';

/** Needs PostgreSQL, see `sync-store.db.spec.ts` for how to run it. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../../apps/api/migrations',
);
const DB_NAME = `links_overload_test_${process.pid}`;

/** Noon in UTC, the user's day hours. */
const at = (day: string) => new Date(`${day}T12:00:00Z`);

function metric(
  key: string,
  to: LocalDate,
  value: (day: LocalDate, index: number) => number,
  more: Partial<DailyMetric> = {},
): DailyMetric {
  const days = daysOf({from: shift(to, -200), to});
  return {
    key,
    module: key.split('.')[0],
    labelKey: key,
    unit: 'hours',
    days: days.map((day, index) => ({day, value: value(day, index)})),
    ...more,
  };
}

/** Calm months, then heavy days from `heavyFrom` to `heavyTo`. */
function life(to: LocalDate, heavyFrom: LocalDate, heavyTo: LocalDate) {
  const heavy = (day: LocalDate) => day >= heavyFrom && day <= heavyTo;
  return [
    metric('activity.phone.night', to, (day, i) =>
      heavy(day) ? 2.5 : 0.5 + (i % 4) / 10,
    ),
    metric('health.band.sleep', to, (day, i) =>
      heavy(day) ? 5 : 7.5 + (i % 3) / 10,
    ),
    metric('diary.mood', to, (day, i) => (heavy(day) ? 2 : 4 - (i % 2) / 2), {
      unit: 'score',
    }),
  ];
}

describe.skipIf(!ADMIN_URL)('OverloadService and LapseService', () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let metrics: DailyMetric[] = [];
  const sent: {userId: string; body: string}[] = [];

  const users = {
    findById: async () => ({locale: 'ru'}),
    timeZoneOf: () => 'UTC',
    hiddenSections: () => [],
    findAll: async () => [],
  };
  const links = {dailyMetrics: async () => metrics};
  const overload = () =>
    new OverloadService(
      db as never,
      links as never,
      users as never,
      {register: () => undefined} as never,
      {
        send: async (userId: string, notification: {body: string}) => {
          sent.push({userId, body: notification.body});
        },
      } as never,
    );
  const lapse = () =>
    new LapseService(
      db as never,
      links as never,
      users as never,
      {register: () => undefined} as never,
    );

  const addUser = async () => {
    const id = randomUUID();
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name, locale)
      VALUES (${id}, ${`${id}@test`}, 'hash', 'Test', 'ru')`);
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

  it('warns once in three days when the last days are heavy, with what pulls and a step', async () => {
    const user = await addUser();
    metrics = life('2026-11-12', '2026-11-05', '2026-11-12');
    const service = overload();
    const status = await service.status(user, [], at('2026-11-10'));
    expect(status.high).toBe(true);
    expect(status.parts[0].weight).toBeGreaterThan(0);
    await service.checkDue(user, at('2026-11-10'));
    expect(sent.filter(one => one.userId === user)).toHaveLength(1);
    expect(sent[sent.length - 1].body).toContain('Маленький шаг');
    // The next day it is still heavy, but one was sent two days ago at most: none.
    await overload().checkDue(user, at('2026-11-11'));
    expect(sent.filter(one => one.userId === user)).toHaveLength(1);
    // Three days on, another.
    await overload().checkDue(user, at('2026-11-13'));
    expect(sent.filter(one => one.userId === user)).toHaveLength(2);
  });

  it('sends none when switched off, and none at night', async () => {
    const user = await addUser();
    metrics = life('2026-11-12', '2026-11-05', '2026-11-12');
    await overload().checkDue(user, new Date('2026-11-10T03:00:00Z'));
    expect(sent.filter(one => one.userId === user)).toHaveLength(0);
    await overload().setEnabled(user, false);
    await overload().checkDue(user, at('2026-11-10'));
    expect(sent.filter(one => one.userId === user)).toHaveLength(0);
    expect((await overload().status(user, [], at('2026-11-10'))).enabled).toBe(
      false,
    );
    // The last warning is a row of its own, not a setting a sync could overwrite.
    expect(
      (await overload().status(user, [], at('2026-11-10'))).lastWarned,
    ).toBeNull();
  });

  it('keeps "well again" after a warning once the days are calm', async () => {
    const user = await addUser();
    metrics = life('2026-11-20', '2026-11-05', '2026-11-10');
    await overload().checkDue(user, at('2026-11-10'));
    expect(await overload().recoveries(user)).toBe(0);
    // A week later the heavy days are out of "lately".
    await overload().checkDue(user, at('2026-11-18'));
    expect(await overload().recoveries(user)).toBe(1);
  });

  it('keeps a likely lapse told, and "kept" when the habit was kept after all', async () => {
    const user = await addUser();
    const today = '2026-11-10';
    // The gym is skipped after a late game, but on the 11th it was kept.
    const games = metric('activity.lateGames', today, (_, i) =>
      i % 3 === 0 ? 2 : 0,
    );
    const gym = metric(
      'habits.gym',
      shift(today, 1),
      (day, i) =>
        day === shift(today, 1) ? 1 : i > 0 && (i - 1) % 3 === 0 ? 0 : 1,
      {module: 'habits', unit: 'count', lapse: 'unmarked'},
    );
    metrics = [games, gym];
    const likely = await lapse().likelyTomorrow(user, at(today));
    expect(likely.habits.map(one => one.key)).toEqual(['habits.gym']);
    // Counted, not told: no summary went out, nothing to keep.
    await lapse().markKept(user, at(shift(today, 3)));
    expect(await lapse().kept(user)).toBe(0);
    // Told with the summary: two days after it, the gym kept counts.
    await lapse().markTold(user, likely.day, likely.habits);
    await lapse().markKept(user, at(shift(today, 2)));
    expect(await lapse().kept(user)).toBe(0);
    await lapse().markKept(user, at(shift(today, 3)));
    expect(await lapse().kept(user)).toBe(1);
  });
});
