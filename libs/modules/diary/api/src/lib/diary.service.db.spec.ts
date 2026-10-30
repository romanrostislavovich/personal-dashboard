import {sql} from 'drizzle-orm';
import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {configureFieldEncryption} from '@pd/api-core/schema';
import {DiaryService} from './diary.service';

/** Needs PostgreSQL, see `sync-store.db.spec.ts` in api-core for how to run it. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../apps/api/migrations',
);
const DB_NAME = `diary_test_${process.pid}`;

describe.skipIf(!ADMIN_URL)('DiaryService', () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let service: DiaryService;

  /** A user with the evening reminder on. */
  const addUser = async () => {
    const id = randomUUID();
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name, locale)
      VALUES (${id}, ${`${id}@test`}, 'hash', 'Test', 'en')`);
    await db.execute(
      sql`INSERT INTO diary_settings (user_id, evening_reminder) VALUES (${id}, true)`,
    );
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
    const config = {get: () => 'UTC'};
    service = new DiaryService(db as never, config as never);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await dropScratchDatabase(admin, DB_NAME);
    }
    await admin?.end();
  });

  it('reminds only those who have not started the day: a note, a mood or a photo starts it', async () => {
    const [silent, wrote, rated, photographed] = await Promise.all(
      [1, 2, 3, 4].map(() => addUser()),
    );
    const today = service.todayDate();
    await service.appendNote(wrote, today, 'A walk');
    await service.setMood(rated, today, 4);
    await db.execute(sql`INSERT INTO diary_photos (user_id, day, mime_type, size, data)
      VALUES (${photographed}, ${today}, 'image/jpeg', 3, '\\x010203')`);

    const due = await service.usersToRemind();

    expect(due).toContain(silent);
    expect(due).not.toContain(wrote);
    expect(due).not.toContain(rated);
    expect(due).not.toContain(photographed);
  });

  it('tells a day started by a note or a photo, for the reminder held till morning', async () => {
    const [wrote, photographed] = await Promise.all([addUser(), addUser()]);
    await service.appendNote(wrote, '2026-10-29', 'Late evening');
    await db.execute(sql`INSERT INTO diary_photos (user_id, day, mime_type, size, data)
      VALUES (${photographed}, '2026-10-29', 'image/jpeg', 3, '\\x010203')`);

    expect(await service.dayStarted(wrote, '2026-10-29')).toBe(true);
    expect(await service.dayStarted(photographed, '2026-10-29')).toBe(true);
    expect(await service.dayStarted(wrote, '2026-10-28')).toBe(false);
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
