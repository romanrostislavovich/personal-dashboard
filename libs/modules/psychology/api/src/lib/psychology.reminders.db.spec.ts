import { sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from 'pg';
import { PsychologyReminders } from './psychology.reminders';

/** Needs PostgreSQL, see `sync-store.db.spec.ts` in api-core for how to run it. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(import.meta.dirname, '../../../../../../apps/api/migrations');
const DB_NAME = `psychology_reminders_test_${process.pid}`;

describe.skipIf(!ADMIN_URL)('PsychologyReminders', () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let reminders: PsychologyReminders;
  const sent: { userId: string; title: string }[] = [];

  const addUser = async (test: string, takenOn: string | null) => {
    const id = randomUUID();
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name, locale)
      VALUES (${id}, ${`${id}@test`}, 'hash', 'Test', 'en')`);
    await db.execute(sql`INSERT INTO psychology_settings
      (user_id, reminder_test, reminder_every_days, reminder_at)
      VALUES (${id}, ${test}, 30, '20:00')`);
    if (takenOn) {
      await db.execute(sql`INSERT INTO psychology_assessments (user_id, test, taken_on, answers)
        VALUES (${id}, ${test}, ${takenOn}, '{3,3,3,3,3}')`);
    }
    return id;
  };

  beforeAll(async () => {
    admin = new Pool({ connectionString: ADMIN_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${DB_NAME}`;
    pool = new Pool({ connectionString: url.toString() });
    pool.on('error', () => undefined);
    db = drizzle({ client: pool, casing: 'snake_case' });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    const users = {
      findById: async (id: string) =>
        (await db.execute(sql`SELECT * FROM users WHERE id = ${id}`)).rows[0] as never,
      timeZoneOf: () => 'UTC',
    };
    const config = { get: () => 'https://dash.example.com/' };
    const scheduler = { register: () => undefined };
    const notifications = {
      send: async (userId: string, message: { title: string }) => {
        sent.push({ userId, ...message });
      },
    };
    reminders = new PsychologyReminders(
      db,
      config as never,
      scheduler as never,
      users as never,
      notifications as never,
    );
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      for (let attempt = 0; attempt < 100; attempt++) {
        const { rows } = await admin.query<{ open: number }>(
          'SELECT count(*)::int AS open FROM pg_stat_activity WHERE datname = $1',
          [DB_NAME],
        );
        if (rows[0].open === 0) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    }
    await admin?.end();
  });

  it('reminds once a period, and not when it was taken within it', async () => {
    const due = await addUser('who5', '2026-09-01');
    const recent = await addUser('gad7', '2026-10-10');
    const never = await addUser('phq9', null);
    const evening = new Date('2026-10-15T20:05:00Z');
    await reminders.remindDue(evening);
    await reminders.remindDue(evening);
    await reminders.remindDue(new Date('2026-10-16T20:05:00Z'));
    await reminders.remindDue(new Date('2026-10-15T12:00:00Z'));
    const to = (userId: string) => sent.filter((message) => message.userId === userId);
    expect(to(due).map((message) => message.title)).toEqual(['🪞 Time for WHO-5']);
    expect(to(recent)).toEqual([]);
    expect(to(never)).toHaveLength(1);
  });
});
