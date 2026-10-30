import {ConflictException} from '@nestjs/common';
import {sql} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {Database} from '../database/database.module';
import {projects} from '../projects/projects.schema';
import {SchedulerService} from '../scheduler/scheduler.service';
import {TrashService} from '../trash/trash.service';
import {AiUndoService} from './ai-undo.service';

/**
 * Undoing a change of the assistant on a real database: what it added goes, what it changed
 * gets its old values, what it deleted comes back from the trash; a row changed again since is
 * left alone. Needs PostgreSQL: set TEST_DATABASE_URL like for `sync-store.db.spec.ts`.
 */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../apps/api/migrations',
);
const DATABASE = 'pd_test_ai_undo';

describe.skipIf(!ADMIN_URL)('AiUndoService', {timeout: 60_000}, () => {
  let admin: Pool;
  let pool: Pool;
  let db: Database;
  let undos: AiUndoService;
  const userId = randomUUID();

  const names = async () =>
    (
      await db.execute<{name: string}>(
        sql`SELECT name FROM projects WHERE user_id = ${userId} ORDER BY name`,
      )
    ).rows.map(row => row.name);
  const add = (name: string) =>
    db.execute(
      sql`INSERT INTO projects (user_id, name) VALUES (${userId}, ${name})`,
    );

  beforeAll(async () => {
    admin = new Pool({connectionString: ADMIN_URL});
    await admin.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DATABASE}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${DATABASE}`;
    pool = new Pool({connectionString: url.toString()});
    pool.on('error', () => undefined);
    const drizzleDb = drizzle({client: pool, casing: 'snake_case'});
    await migrate(drizzleDb, {migrationsFolder: MIGRATIONS});
    db = drizzleDb as unknown as Database;
    const trash = new TrashService(db, {
      register: () => undefined,
    } as unknown as SchedulerService);
    await trash.onApplicationBootstrap();
    undos = new AiUndoService(db, trash);
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name)
      VALUES (${userId}, 'undo@test.local', 'x', 'Test')`);
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin?.end();
  });

  beforeEach(() =>
    db.execute(sql`DELETE FROM projects WHERE user_id = ${userId}`),
  );

  it('takes back what was added and what was changed', async () => {
    await add('Garden');
    const {undo} = await undos.capture(userId, [projects], async () => {
      await add('Kitchen');
      await db.execute(
        sql`UPDATE projects SET name = 'Big garden' WHERE name = 'Garden'`,
      );
    });
    expect(await names()).toEqual(['Big garden', 'Kitchen']);
    await undos.undo(userId, undo!);
    expect(await names()).toEqual(['Garden']);
  });

  it('brings back what was deleted, from the trash', async () => {
    await add('Garden');
    const {undo} = await undos.capture(userId, [projects], () =>
      db.execute(sql`DELETE FROM projects WHERE user_id = ${userId}`),
    );
    expect(await names()).toEqual([]);
    expect(undo?.trash).toHaveLength(1);
    await undos.undo(userId, undo!);
    expect(await names()).toEqual(['Garden']);
  });

  it('leaves alone a row the person changed again since', async () => {
    await add('Garden');
    const {undo} = await undos.capture(userId, [projects], () =>
      db.execute(
        sql`UPDATE projects SET name = 'Big garden' WHERE user_id = ${userId}`,
      ),
    );
    await db.execute(
      sql`UPDATE projects SET name = 'My garden' WHERE user_id = ${userId}`,
    );
    await expect(undos.undo(userId, undo!)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(await names()).toEqual(['My garden']);
  });

  it('has nothing to undo when nothing changed', async () => {
    const {undo, value} = await undos.capture(
      userId,
      [projects],
      async () => 42,
    );
    expect(value).toBe(42);
    expect(undo).toBeNull();
  });
});
