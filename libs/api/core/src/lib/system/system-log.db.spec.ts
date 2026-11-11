import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {join} from 'node:path';
import {Pool} from 'pg';
import {Database} from '../database/database.module';
import {NotificationsService} from '../notifications/notifications.service';
import {SchedulerService} from '../scheduler/scheduler.service';
import {UsersService} from '../users/users.service';
import {SystemLogService} from './system-log.service';
import {SystemLogger} from './system-logger';

/**
 * The system log on a real database. Needs PostgreSQL: set TEST_DATABASE_URL like for
 * `sync-store.db.spec.ts`; a scratch database is created and dropped afterwards.
 */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../apps/api/migrations',
);
const DATABASE = 'pd_test_system_log';

describe.skipIf(!ADMIN_URL)('SystemLogService', {timeout: 60_000}, () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let service: SystemLogService;

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
    service = new SystemLogService(
      db as unknown as Database,
      {owner: async () => null} as unknown as UsersService,
      {} as NotificationsService,
      {register: () => undefined} as unknown as SchedulerService,
    );
    service.onModuleInit();
  });

  afterAll(async () => {
    service.onModuleDestroy();
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it('counts a burst of the same warning in one entry', async () => {
    const logger = new SystemLogger({json: false, logLevels: []});
    for (let i = 0; i < 50; i++) {
      logger.warn('LanguageTool is resting', 'WritingService');
    }
    await service.settled();

    const entries = await service.list();
    expect(entries).toHaveLength(1);
    expect(entries[0].count).toBe(50);
  });
});
