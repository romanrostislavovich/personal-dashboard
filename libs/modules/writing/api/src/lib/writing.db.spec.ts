import { sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from 'pg';
import { WritingService } from './writing.service';

/** Runs against the generated migrations, like the other *.db.spec.ts. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(import.meta.dirname, '../../../../../../apps/api/migrations');
const DB_NAME = `writing_test_${process.pid}`;

describe.skipIf(!ADMIN_URL)('the count of fixes taken', { timeout: 60_000 }, () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let writing: WritingService;
  const userId = randomUUID();

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
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name, locale)
      VALUES (${userId}, 'writing@test', 'hash', 'Test', 'en')`);
    writing = new WritingService(db as never, null as never, null as never, null as never);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin?.end();
  });

  it('adds up, survives a change of the settings and is not one of them', async () => {
    await writing.accepted(userId, 1);
    await writing.accepted(userId, 4);
    await writing.saveSettings(userId, { picky: true }).catch(() => undefined);
    expect(await writing.fixesAccepted(userId)).toBe(5);
    expect(await writing.settings(userId)).not.toHaveProperty('fixesAccepted');
  });
});
