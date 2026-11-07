import {DailyMetricSource, HourlySource} from '@pd/api-core';
import {sql} from 'drizzle-orm';
import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {TasksLinks} from './tasks.links';

/**
 * The tasks' daily numbers of Links on a real database: the open loops, the share of what was
 * due that got done, by the user's own days. Needs PostgreSQL: set TEST_DATABASE_URL.
 */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../apps/api/migrations',
);
const DATABASE = 'pd_test_tasks_links';

describe.skipIf(!ADMIN_URL)(
  "the tasks' daily numbers",
  {timeout: 60_000},
  () => {
    let admin: Pool;
    let pool: Pool;
    let db: NodePgDatabase;
    let source: DailyMetricSource;
    let hourly: HourlySource;
    const userId = randomUUID();
    const otherId = randomUUID();

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
      VALUES (${userId}, 'links@test.local', 'x', 'Test'),
             (${otherId}, 'other-links@test.local', 'x', 'Other')`);
      const links = {
        registerProject: () => undefined,
        registerPages: () => undefined,
        registerDailyMetrics: (registered: DailyMetricSource) =>
          (source = registered),
        registerHourly: (registered: HourlySource) => (hourly = registered),
      };
      const users = {
        findById: async () => ({}),
        timeZoneOf: () => 'Europe/Warsaw',
      };
      new TasksLinks(
        db as never,
        links as never,
        users as never,
      ).onModuleInit();
    }, 60_000);

    afterAll(async () => {
      await pool?.end();
      await admin?.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
      await admin?.end();
    });

    it('counts the open loops and the due ones done by the local day', async () => {
      // 00:30 in Warsaw on the 2nd is still the 1st in UTC.
      await db.execute(sql`INSERT INTO tasks (user_id, title, due_date, created_at, completed_at)
      VALUES
        (${userId}, 'undated', NULL, '2026-11-01T08:00:00Z', NULL),
        (${userId}, 'late', '2026-11-01', '2026-11-01T08:00:00Z', '2026-11-01T23:30:00Z'),
        (${otherId}, 'not mine', NULL, '2026-11-01T08:00:00Z', NULL)`);
      const metrics = await source.metrics(userId, {
        from: '2026-11-01',
        to: '2026-11-02',
      });
      const days = (key: string) =>
        metrics.find(metric => metric.key === key)?.days;
      expect(days('tasks.openLoops')).toEqual([
        {day: '2026-11-01', value: 1},
        {day: '2026-11-02', value: 1},
      ]);
      // Done at 00:30 on the 2nd (local): the 1st's due task was not done that day.
      expect(days('tasks.dueDone')).toEqual([{day: '2026-11-01', value: 0}]);
      expect(days('tasks.done')).toEqual([{day: '2026-11-02', value: 1}]);
    });

    it('counts the tasks done by the local hour, from the first task on', async () => {
      const {metrics} = await hourly.hours(
        userId,
        {from: '2026-10-31', to: '2026-11-02'},
        'Europe/Warsaw',
      );
      const [done] = metrics;
      expect(done.key).toBe('tasks.hour.done');
      expect(done.productive).toBe(true);
      // 23:30 UTC on the 1st is 00:30 on the 2nd in Warsaw.
      expect(done.hours).toEqual([{hour: '2026-11-02T00', value: 1}]);
      // The list began on the 1st: the 31st is unknown, not a zero.
      expect(done.days).toEqual(['2026-11-01', '2026-11-02']);
    });
  },
);
