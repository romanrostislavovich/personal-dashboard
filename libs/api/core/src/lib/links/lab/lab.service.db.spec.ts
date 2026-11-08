import {DailyMetric} from '@pd/contracts';
import {sql} from 'drizzle-orm';
import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {daysOf, shift} from '../daily-series';
import {LabService} from './lab.service';

/** Needs PostgreSQL, see `sync-store.db.spec.ts` for how to run it. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../../apps/api/migrations',
);
const DB_NAME = `links_lab_test_${process.pid}`;

// Yesterday: a button press is answered by the real clock, and a day to come cannot be marked.
const START = shift(new Date().toISOString().slice(0, 10), -1);
const at = (day: string, time = '12:00') => new Date(`${day}T${time}:00Z`);

describe.skipIf(!ADMIN_URL)('LabService', () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  const sent: {userId: string; title: string; actions?: unknown[]}[] = [];
  let metric: DailyMetric | null = null;
  const actions = new Map<
    string,
    (user: unknown, payload: string) => unknown
  >();

  const lab = () => {
    const service = new LabService(
      db as never,
      {dailyMetric: async () => metric} as never,
      {
        findById: async () => ({locale: 'ru'}),
        timeZoneOf: () => 'UTC',
      } as never,
      {register: () => undefined} as never,
      {
        send: async (
          userId: string,
          notification: {title: string; actions?: unknown[]},
        ) => {
          sent.push({userId, ...notification});
        },
      } as never,
      {
        registerAction: (action: {
          name: string;
          handler: (user: unknown, payload: string) => unknown;
        }) => actions.set(action.name, action.handler),
      } as never,
    );
    service.onModuleInit();
    return service;
  };

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

  const rating = {
    hypothesis: 'Первый блок работы легче без уведомлений?',
    change: 'первый блок без уведомлений',
    metric: {
      kind: 'rating' as const,
      question: 'Как прошёл первый блок?',
      askAt: '18:00',
    },
    days: 14,
    startOn: START,
    morningAt: '08:00',
    safe: true as const,
  };

  it('starts with random days made beforehand, keeps the rules by version, pauses and stops', async () => {
    const user = await addUser();
    const service = lab();
    const started = await service.create(user, rating);
    expect(started.endOn).toBe(shift(START, 13));
    expect(started.version).toBe(1);
    await service.update(user, started.id, {
      change: 'без уведомлений до обеда',
    });
    await service.update(user, started.id, {status: 'paused'});
    const [kept] = (await service.list(user, at(START))).experiments;
    expect(kept.version).toBe(2);
    expect(kept.versions.map(one => one.change)).toEqual([
      'первый блок без уведомлений',
      'без уведомлений до обеда',
    ]);
    expect(kept.status).toBe('paused');
    await service.update(user, started.id, {status: 'stopped'});
    await expect(
      service.update(user, started.id, {status: 'running'}),
    ).rejects.toThrow();
  });

  it('tells the day in the morning and asks the rating once, the buttons note it', async () => {
    const user = await addUser();
    const service = lab();
    const started = await service.create(user, rating);
    await service.tell(user, at(START, '07:00'));
    expect(sent.filter(one => one.userId === user)).toHaveLength(0);
    await service.tell(user, at(START, '08:10'));
    await service.tell(user, at(START, '09:00'));
    expect(sent.filter(one => one.userId === user)).toHaveLength(1);
    await service.tell(user, at(START, '18:05'));
    const asked = sent.filter(one => one.userId === user);
    expect(asked).toHaveLength(2);
    expect(asked[1].actions).toHaveLength(5);
    const reply = await actions.get('xr')?.(
      {id: user, locale: 'ru'},
      `${started.id}:${START}:4`,
    );
    expect(reply).toBe('Записал: 4 из 5.');
    const [found] = (await service.list(user, at(shift(START, 1)))).experiments;
    expect(found.days[0]).toMatchObject({day: START, value: 4});
  });

  it('keeps a missed day missing, a day not kept apart, and is done after its end', async () => {
    const user = await addUser();
    const service = lab();
    const started = await service.create(user, rating);
    await service.markDay(
      user,
      started.id,
      {day: START, rating: 5, kept: false},
      at(shift(START, 3)),
    );
    await expect(
      service.markDay(
        user,
        started.id,
        {day: shift(START, 30), rating: 3},
        at(shift(START, 3)),
      ),
    ).rejects.toThrow();
    const [found] = (await service.list(user, at(shift(START, 3)))).experiments;
    expect(found.result.notKept).toBe(1);
    expect(found.result.missing).toBe(2);
    expect(found.result.enough).toBe(false);
    await service.tell(user, at(shift(START, 14)));
    const [done] = (await service.list(user, at(shift(START, 14)))).experiments;
    expect(done.status).toBe('done');
    expect((await service.counts(user)).done).toBe(1);
  });

  it('reads a daily number of Links, and refuses one the user lacks', async () => {
    const user = await addUser();
    metric = {
      key: 'activity.index.deepWork',
      module: 'activity',
      labelKey: 'deep',
      unit: 'hours',
      days: daysOf({from: START, to: shift(START, 13)}).map((day, i) => ({
        day,
        value: 2 + (i % 3),
      })),
    };
    const started = await lab().create(user, {
      ...rating,
      metric: {kind: 'number', key: 'activity.index.deepWork'},
    });
    const [found] = (await lab().list(user, at(shift(START, 14)))).experiments;
    expect(found.days.every(day => day.value !== null)).toBe(true);
    expect(found.result.enough).toBe(true);
    expect(found.result.interval).not.toBeNull();
    metric = null;
    await expect(
      lab().create(user, {
        ...rating,
        metric: {kind: 'number', key: 'made.up'},
      }),
    ).rejects.toThrow();
    // Another user's experiment is not theirs to touch.
    await expect(
      lab().update(await addUser(), started.id, {status: 'paused'}),
    ).rejects.toThrow();
  });
});
