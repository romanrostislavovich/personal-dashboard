import {BadRequestException} from '@nestjs/common';
import {sql} from 'drizzle-orm';
import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {TasksService} from './tasks.service';

/**
 * Tasks with steps on a real database: one level, the task done with its last step, deleting with
 * or without the steps. Needs PostgreSQL: set TEST_DATABASE_URL like for `sync-store.db.spec.ts`.
 */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../apps/api/migrations',
);
const DATABASE = 'pd_test_task_steps';

describe.skipIf(!ADMIN_URL)('tasks with steps', {timeout: 60_000}, () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let service: TasksService;
  const userId = randomUUID();
  const otherId = randomUUID();
  const listId = randomUUID();

  const byId = async (id: string) =>
    (await service.list(userId)).find(task => task.id === id);
  const isDone = async (id: string) => Boolean((await byId(id))?.completedAt);

  beforeAll(async () => {
    admin = new Pool({connectionString: ADMIN_URL});
    await admin.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DATABASE}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${DATABASE}`;
    pool = new Pool({connectionString: url.toString()});
    pool.on('error', () => undefined);
    db = drizzle({client: pool, casing: 'snake_case'});
    await migrate(db, {migrationsFolder: MIGRATIONS});
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name)
      VALUES (${userId}, 'steps@test.local', 'x', 'Test'),
             (${otherId}, 'other-steps@test.local', 'x', 'Other')`);
    await db.execute(
      sql`INSERT INTO tasks_lists (id, user_id, name) VALUES (${listId}, ${userId}, 'Дом')`,
    );
    const users = {
      findById: async () => ({id: userId}),
      timeZoneOf: () => 'UTC',
    };
    const links = {timeSpentOn: async () => new Map()};
    service = new TasksService(db as never, users as never, links as never);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin?.end();
  });

  it('a step takes the list of its task; the last step done closes the task', async () => {
    const move = await service.create(userId, {title: 'Переезд', listId});
    const pack = await service.create(userId, {
      title: 'Собрать вещи',
      parentId: move.id,
    });
    const contract = await service.create(userId, {
      title: 'Расторгнуть договор',
      parentId: move.id,
    });

    expect((await byId(pack.id))?.listId).toBe(listId);
    expect((await byId(move.id))?.steps).toEqual({done: 0, total: 2});

    await service.complete(userId, pack.id);
    expect(await isDone(move.id)).toBe(false);
    expect((await byId(move.id))?.steps).toEqual({done: 1, total: 2});

    await service.complete(userId, contract.id);
    expect(await isDone(move.id)).toBe(true);

    // A step reopened (or a new one added) brings its task back.
    await service.reopen(userId, contract.id);
    expect(await isDone(move.id)).toBe(false);
  });

  it('a task done by hand is done with all its steps', async () => {
    const trip = await service.create(userId, {title: 'Поездка'});
    const steps = await Promise.all(
      ['Билеты', 'Отель'].map(title =>
        service.create(userId, {title, parentId: trip.id}),
      ),
    );

    await service.complete(userId, trip.id);

    for (const step of steps) {
      expect(await isDone(step.id)).toBe(true);
    }
  });

  it('keeps to one level and to the own tasks of the user', async () => {
    const parent = await service.create(userId, {title: 'Ремонт'});
    const step = await service.create(userId, {
      title: 'Краска',
      parentId: parent.id,
    });
    const other = await service.create(otherId, {title: 'Чужая'});

    await expect(
      service.create(userId, {title: 'Кисть', parentId: step.id}),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update(userId, parent.id, {parentId: parent.id}),
    ).rejects.toBeInstanceOf(BadRequestException);
    const loose = await service.create(userId, {title: 'Отдельная'});
    await expect(
      service.update(userId, parent.id, {parentId: loose.id}),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(userId, {title: 'Кисть', parentId: other.id}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('groups tasks under a new task in their shared list', async () => {
    const a = await service.create(userId, {title: 'Коробки', listId});
    const b = await service.create(userId, {title: 'Грузчики', listId});

    const parent = await service.group(userId, {
      taskIds: [a.id, b.id],
      title: 'Новый переезд',
    });

    expect(parent.listId).toBe(listId);
    expect((await byId(a.id))?.parentId).toBe(parent.id);
    expect((await byId(parent.id))?.steps).toEqual({done: 0, total: 2});
    await expect(
      service.group(userId, {taskIds: [parent.id], title: 'Ещё выше'}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deletes a task with its steps, or keeps the steps as tasks of their own', async () => {
    const one = await service.create(userId, {title: 'Группа 1'});
    const oneStep = await service.create(userId, {
      title: 'Шаг 1',
      parentId: one.id,
    });
    const two = await service.create(userId, {title: 'Группа 2'});
    const twoStep = await service.create(userId, {
      title: 'Шаг 2',
      parentId: two.id,
    });

    await service.remove(userId, one.id);
    await service.remove(userId, two.id, 'keep');

    expect(await byId(oneStep.id)).toBeUndefined();
    expect((await byId(twoStep.id))?.parentId).toBeNull();
  });
});
