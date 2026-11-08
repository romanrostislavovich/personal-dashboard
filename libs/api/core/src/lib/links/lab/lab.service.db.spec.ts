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
    {
      handler: (user: unknown, payload: string) => unknown;
      settled?: (user: unknown, payload: string) => Promise<boolean>;
    }
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
          settled?: (user: unknown, payload: string) => Promise<boolean>;
        }) => actions.set(action.name, action),
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
    const started = await service.create(user, rating, at(START));
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
    const started = await service.create(user, rating, at(START));
    await service.tell(user, at(START, '07:00'));
    expect(sent.filter(one => one.userId === user)).toHaveLength(0);
    await service.tell(user, at(START, '08:10'));
    await service.tell(user, at(START, '09:00'));
    expect(sent.filter(one => one.userId === user)).toHaveLength(1);
    await service.tell(user, at(START, '18:05'));
    const asked = sent.filter(one => one.userId === user);
    expect(asked).toHaveLength(2);
    expect(asked[1].actions).toHaveLength(5);
    const button = actions.get('xr');
    const who = {id: user, locale: 'ru'};
    expect(await button?.settled?.(who, `${started.id}:${START}:4`)).toBe(
      false,
    );
    const reply = await button?.handler(who, `${started.id}:${START}:4`);
    expect(reply).toBe('Записал: 4 из 5.');
    expect(await button?.settled?.(who, `${started.id}:${START}:4`)).toBe(true);
    // A forged press: a rating out of 1–5 is refused, not written.
    expect(await button?.handler(who, `${started.id}:${START}:9`)).toBe(
      'Этот эксперимент уже закончен или удалён.',
    );
    const [found] = (await service.list(user, at(shift(START, 1)))).experiments;
    expect(found.days[0]).toMatchObject({day: START, value: 4});
  });

  it('keeps a missed day missing, a day not kept apart, and is done after its end', async () => {
    const user = await addUser();
    const service = lab();
    const started = await service.create(user, rating, at(START));
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
    const started = await lab().create(
      user,
      {...rating, metric: {kind: 'number', key: 'activity.index.deepWork'}},
      at(START),
    );
    const [found] = (await lab().list(user, at(shift(START, 14)))).experiments;
    expect(found.days.every(day => day.value !== null)).toBe(true);
    expect(found.result.enough).toBe(true);
    expect(found.result.interval).not.toBeNull();
    metric = null;
    await expect(
      lab().create(
        user,
        {...rating, metric: {kind: 'number', key: 'made.up'}},
        at(START),
      ),
    ).rejects.toThrow();
    // Another user's experiment is not theirs to touch.
    const stranger = await addUser();
    await expect(
      lab().update(stranger, started.id, {status: 'paused'}),
    ).rejects.toThrow();
    await expect(
      lab().markDay(stranger, started.id, {day: START, kept: true}),
    ).rejects.toThrow();
  });

  it('refuses a start in the past, shows every day of the plan, ends a paused one once', async () => {
    const user = await addUser();
    const service = lab();
    await expect(
      service.create(user, rating, at(shift(START, 1))),
    ).rejects.toThrow();
    const started = await service.create(user, rating, at(START));
    const [planned] = (await service.list(user, at(START))).experiments;
    expect(planned.days).toHaveLength(14);
    expect(planned.days.every(day => day.value === null)).toBe(true);
    // Today's rating is shown (and counted) at once.
    await service.markDay(user, started.id, {day: START, rating: 3}, at(START));
    const [rated] = (await service.list(user, at(START))).experiments;
    expect(rated.days[0].value).toBe(3);
    expect(rated.result.ordinary.n + rated.result.changed.n).toBe(1);
    await service.update(user, started.id, {status: 'paused'});
    await service.tell(user, at(shift(START, 14)));
    await service.tell(user, at(shift(START, 14), '12:10'));
    const [done] = (await service.list(user, at(shift(START, 14)))).experiments;
    expect(done.status).toBe('done');
    expect(
      sent.filter(
        one => one.userId === user && one.title === '🧪 Эксперимент закончен',
      ),
    ).toHaveLength(1);
  });

  it('takes no day of a stopped one', async () => {
    const user = await addUser();
    const service = lab();
    const started = await service.create(user, rating, at(START));
    await service.update(user, started.id, {status: 'stopped'});
    await expect(
      service.markDay(user, started.id, {day: START, rating: 2}),
    ).rejects.toThrow();
  });
});
