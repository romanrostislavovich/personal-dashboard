import {sql} from 'drizzle-orm';
import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {configureFieldEncryption} from '@pd/api-core/schema';
import {HabitsService} from './habits.service';

/** Needs PostgreSQL, see `sync-store.db.spec.ts` in api-core for how to run it. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../apps/api/migrations',
);
const DB_NAME = `habits_test_${process.pid}`;

describe.skipIf(!ADMIN_URL)('HabitsService', () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let service: HabitsService;
  const sent: {userId: string; title: string; actions?: {action: string}[]}[] =
    [];

  const addUser = async () => {
    const id = randomUUID();
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name, locale)
      VALUES (${id}, ${`${id}@test`}, 'hash', 'Test', 'en')`);
    return id;
  };

  beforeAll(async () => {
    configureFieldEncryption('a-test-key-that-is-long-enough-0123456789');
    admin = new Pool({connectionString: ADMIN_URL});
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${DB_NAME}`;
    pool = new Pool({connectionString: url.toString()});
    pool.on('error', () => undefined);
    db = drizzle({client: pool, casing: 'snake_case'});
    await migrate(db, {migrationsFolder: MIGRATIONS});
    const users = {
      findById: async (id: string) =>
        (await db.execute(sql`SELECT * FROM users WHERE id = ${id}`))
          .rows[0] as never,
      timeZoneOf: () => 'UTC',
    };
    const notifications = {
      send: async (
        userId: string,
        message: {title: string; actions?: {action: string}[]},
      ) => {
        sent.push({userId, ...message});
      },
    };
    service = new HabitsService(db, users as never, notifications as never);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await dropScratchDatabase(admin, DB_NAME);
    }
    await admin?.end();
  });

  it('keeps a habit encrypted name, marks days and counts the run', async () => {
    const userId = await addUser();
    const today = new Date().toISOString().slice(0, 10);
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const habit = await service.create(userId, {
      kind: 'custom',
      name: 'Sugar',
      goal: 'quit',
      maxDaysPerWeek: null,
      unit: null,
      startedOn: tenDaysAgo,
      askAt: null,
    });
    expect(habit).toMatchObject({
      name: 'Sugar',
      stats: {currentStreak: 11, bestStreak: 11},
    });
    const [stored] = (
      await db.execute(sql`SELECT name FROM habits WHERE id = ${habit.id}`)
    ).rows;
    expect(stored['name']).not.toBe('Sugar');

    const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const marked = await service.mark(userId, habit.id, fiveDaysAgo, {
      status: 'used',
    });
    expect(marked.stats).toMatchObject({
      currentStreak: 5,
      bestStreak: 5,
      usedDays: 1,
    });
    const unmarked = await service.unmark(userId, habit.id, fiveDaysAgo);
    expect(unmarked.stats.currentStreak).toBe(11);

    // Another user's habit cannot be marked.
    const stranger = await addUser();
    await expect(
      service.mark(stranger, habit.id, today, {status: 'used'}),
    ).rejects.toThrow();
  });

  it('asks in the evening once a day, and takes the answer and how much', async () => {
    const userId = await addUser();
    const habit = await service.create(userId, {
      kind: 'alcohol',
      name: null,
      goal: 'less',
      maxDaysPerWeek: 2,
      unit: 'glasses',
      startedOn: '2026-01-01',
      askAt: '21:00',
    });
    const evening = new Date('2026-10-15T21:05:00Z');
    await service.askDue(evening);
    await service.askDue(evening);
    await service.askDue(new Date('2026-10-15T20:00:00Z'));
    const questions = sent.filter(message => message.userId === userId);
    expect(questions).toHaveLength(1);
    expect(questions[0].title).toBe('🌙 A day without alcohol?');

    const used =
      questions[0].actions?.find(a => a.action.startsWith('hb:u:'))?.action ??
      '';
    const user = (
      await db.execute(sql`SELECT * FROM users WHERE id = ${userId}`)
    ).rows[0];
    const reply = await service.answerButton(
      user as never,
      used.slice('hb:'.length),
    );
    expect(typeof reply === 'object' && reply.reply).toContain(
      'How many glasses',
    );
    if (typeof reply === 'object') {
      expect(await reply.expectText(user as never, '2,5')).toBe(
        'Noted: 2.5 glasses.',
      );
    }
    const after = await service.get(userId, habit.id);
    expect(after.recent).toEqual([
      {day: '2026-10-15', status: 'used', amount: 2.5},
    ]);
  });

  it('a habit to build: asked in the evening, "Done" marks the day, "Not today" takes it off', async () => {
    const userId = await addUser();
    const habit = await service.create(userId, {
      kind: 'custom',
      name: 'Gym',
      goal: 'daily',
      maxDaysPerWeek: null,
      timesPerWeek: null,
      unit: null,
      startedOn: '2026-10-10',
      askAt: '20:00',
    });
    await service.askDue(new Date('2026-10-15T20:01:00Z'));
    const question = sent.find(message => message.userId === userId);
    expect(question?.title).toBe('🌙 «Gym» today — done?');
    const done =
      question?.actions?.find(a => a.action.startsWith('hb:d:'))?.action ?? '';
    const user = (
      await db.execute(sql`SELECT * FROM users WHERE id = ${userId}`)
    ).rows[0];
    expect(
      await service.answerButton(user as never, done.slice('hb:'.length)),
    ).toContain('Done!');
    expect((await service.get(userId, habit.id)).recent).toEqual([
      {day: '2026-10-15', status: 'done', amount: null},
    ]);
    const notToday = done.replace('hb:d:', 'n:');
    await service.answerButton(user as never, notToday);
    expect((await service.get(userId, habit.id)).recent).toEqual([]);
  });

  it('the evening question is settled once its day is marked on the page', async () => {
    const userId = await addUser();
    const habit = await service.create(userId, {
      kind: 'custom',
      name: 'Alcohol',
      goal: 'quit',
      maxDaysPerWeek: null,
      timesPerWeek: null,
      unit: null,
      startedOn: '2026-10-10',
      askAt: '21:00',
    });
    const user = {id: userId} as never;
    const button = `c:${habit.id}:2026-10-29`;

    expect(await service.buttonSettled(user, button)).toBe(false);
    await service.mark(userId, habit.id, '2026-10-29', {status: 'clean'});
    expect(await service.buttonSettled(user, button)).toBe(true);
    await service.remove(userId, habit.id);
    expect(await service.buttonSettled(user, button)).toBe(true);
  });
});

/** Waits for the closed connections to leave, then drops the scratch database. */
async function dropScratchDatabase(admin: Pool, name: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const {rows} = await admin.query<{open: number}>(
      'SELECT count(*)::int AS open FROM pg_stat_activity WHERE datname = $1',
      [name],
    );
    if (rows[0].open === 0) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
}
