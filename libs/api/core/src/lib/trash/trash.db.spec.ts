import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from 'pg';
import { Database } from '../database/database.module';
import { SchedulerService } from '../scheduler/scheduler.service';
import { APPLYING_SETTING } from '../sync/sync-triggers';
import { TrashService } from './trash.service';

/**
 * The trash on a real database: deleted rows come back with what was deleted along with them.
 * Needs PostgreSQL: set TEST_DATABASE_URL like for `sync-store.db.spec.ts`.
 */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(import.meta.dirname, '../../../../../../apps/api/migrations');
const DATABASE = 'pd_test_trash';

describe.skipIf(!ADMIN_URL)('TrashService', { timeout: 60_000 }, () => {
  let admin: Pool;
  let pool: Pool;
  let db: Database;
  let trash: TrashService;
  const userId = randomUUID();

  const count = async (query: ReturnType<typeof sql>) =>
    (await db.execute<{ n: number }>(query)).rows[0].n;

  beforeAll(async () => {
    admin = new Pool({ connectionString: ADMIN_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DATABASE}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${DATABASE}`;
    pool = new Pool({ connectionString: url.toString() });
    pool.on('error', () => undefined);
    const drizzleDb = drizzle({ client: pool, casing: 'snake_case' });
    await migrate(drizzleDb, { migrationsFolder: MIGRATIONS });
    db = drizzleDb as unknown as Database;
    trash = new TrashService(db, { register: () => undefined } as unknown as SchedulerService);
    await trash.onApplicationBootstrap();
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name)
      VALUES (${userId}, 'trash@test.local', 'x', 'Test')`);
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin?.end();
  });

  it('an account deleted with its matches comes back as one item', async () => {
    const accountId = randomUUID();
    await db.execute(sql`INSERT INTO games_accounts (id, user_id, game, external_id, display_name)
      VALUES (${accountId}, ${userId}, 'dota2', '123', 'Me')`);
    await db.execute(sql`
      INSERT INTO games_dota_matches (account_id, match_id, hero_id, won, kills, deaths, assists,
        duration_sec, started_at, game_mode, lobby_type)
      SELECT ${accountId}, n, 1, true, 1, 1, 1, 1800, now(), 22, 7 FROM generate_series(1, 3) n
    `);

    await db.execute(sql`DELETE FROM games_accounts WHERE id = ${accountId}`);
    const [item] = await trash.list(userId);
    expect(item).toMatchObject({ table: 'games_accounts', label: 'Me', rows: 4 });
    expect(item.parts).toEqual([
      { table: 'games_accounts', count: 1 },
      { table: 'games_dota_matches', count: 3 },
    ]);

    await trash.restore(userId, item.id);
    expect(await count(sql`SELECT count(*)::int AS n FROM games_dota_matches`)).toBe(3);
    expect(await trash.list(userId)).toEqual([]);
  });

  it('keeps deletions made here, not those that came from the other instance', async () => {
    const id = randomUUID();
    const insert = sql`INSERT INTO birthdays (id, user_id, name, month, day)
      VALUES (${id}, ${userId}, 'Anna', 3, 4)`;
    await db.execute(insert);
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config(${APPLYING_SETTING}, 'on', true)`);
      await tx.execute(sql`DELETE FROM birthdays WHERE id = ${id}`);
    });
    expect(await trash.list(userId)).toEqual([]);

    await db.execute(insert);
    await db.execute(sql`DELETE FROM birthdays WHERE id = ${id}`);
    const [item] = await trash.list(userId);
    expect(item).toMatchObject({ table: 'birthdays', label: 'Anna', rows: 1 });

    await trash.remove(userId, item.id);
    expect(await trash.list(userId)).toEqual([]);
  });

  it("does not show or restore another user's item, and forgets after 30 days", async () => {
    const id = randomUUID();
    await db.execute(sql`INSERT INTO birthdays (id, user_id, name, month, day)
      VALUES (${id}, ${userId}, 'Bob', 5, 6)`);
    await db.execute(sql`DELETE FROM birthdays WHERE id = ${id}`);
    const [item] = await trash.list(userId);
    await expect(trash.restore(randomUUID(), item.id)).rejects.toThrow('Not in the trash');

    await db.execute(sql`UPDATE trash.rows SET deleted_at = now() - interval '31 days'`);
    await trash.purge();
    expect(await trash.list(userId)).toEqual([]);
  });
});
