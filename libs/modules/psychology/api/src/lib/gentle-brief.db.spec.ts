import { configureFieldEncryption } from '@pd/api-core/schema';
import { LocalDate } from '@pd/contracts';
import { sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from 'pg';
import { BriefService } from './brief.service';
import { GentleDayService } from './gentle-day.service';
import { PsychologyService } from './psychology.service';

/** Needs PostgreSQL, see `sync-store.db.spec.ts` in api-core for how to run it. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(import.meta.dirname, '../../../../../../apps/api/migrations');
const DB_NAME = `psychology_gentle_test_${process.pid}`;

describe.skipIf(!ADMIN_URL)('a gentle day and briefs', () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let gentle: GentleDayService;
  let briefs: BriefService;

  const addUser = async () => {
    const id = randomUUID();
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name, locale)
      VALUES (${id}, ${`${id}@test`}, 'hash', 'Test', 'en')`);
    return id;
  };

  beforeAll(async () => {
    configureFieldEncryption('psychology-gentle-database-test-encryption-key');
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
    const psychology = new PsychologyService(db as never, {} as never, users as never);
    gentle = new GentleDayService(db as never);
    briefs = new BriefService(db as never, psychology, users as never);
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin?.end();
  });

  it('keeps the plan of a day with its states, and forgets it on leaving', async () => {
    const userId = await addUser();
    const date = '2026-10-22' as LocalDate;
    expect(await gentle.day(userId, date)).toEqual({ date, on: false, steps: [] });

    await gentle.saveDay(userId, {
      date,
      steps: [{ text: 'Drink water', smaller: null, state: 'open' }],
    });
    await gentle.saveDay(userId, {
      date,
      steps: [{ text: 'Drink water', smaller: null, state: 'rest' }],
    });
    expect((await gentle.day(userId, date)).steps).toEqual([
      { text: 'Drink water', smaller: null, state: 'rest' },
    ]);
    // Stored encrypted, like the diary.
    const raw = await db.execute(
      sql`SELECT steps FROM psychology_gentle_days WHERE user_id = ${userId}`,
    );
    expect(String(raw.rows[0]['steps'])).not.toContain('Drink water');

    await gentle.leaveDay(userId, date);
    expect((await gentle.day(userId, date)).on).toBe(false);
  });

  it('keeps the library of each user apart', async () => {
    const [one, other] = [await addUser(), await addUser()];
    const step = await gentle.addStep(one, { text: 'Tidy up', smaller: 'One cup' });
    expect(await gentle.steps(other)).toEqual([]);
    await gentle.removeStep(other, step.id);
    expect(await gentle.steps(one)).toEqual([step]);
  });

  it('saves a brief and exports it as a Word file', async () => {
    const userId = await addUser();
    const brief = await briefs.add(userId, {
      title: 'Psychiatrist',
      appointmentOn: null,
      from: '2026-10-01',
      to: '2026-10-31',
      eventIds: [],
      assessmentIds: [],
      changes: 'Sleeping better',
      questions: ['Can the dose\nstay?'],
      notes: '',
    });
    // A line break inside a question would split it in two.
    expect(brief.questions).toEqual(['Can the dose stay?']);
    expect(await briefs.list(await addUser())).toEqual([]);
    const { file, name } = await briefs.export(userId, brief.id);
    expect(name).toBe('brief-2026-10-31.docx');
    expect(file.subarray(0, 2).toString()).toBe('PK');
  });
});
