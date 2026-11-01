import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {aiConnections, aiUsage} from '../ai/ai.schema';
import {configureFieldEncryption} from '../crypto/encrypted-columns';
import {Database} from '../database/database.module';
import {notificationOutbox} from '../notifications/notifications.schema';
import {SyncService} from '../sync/sync.service';
import {users} from '../users/users.schema';
import {SystemMetricsService} from './system-metrics.service';

/**
 * The numbers of Settings → System on a real database. Needs PostgreSQL: set TEST_DATABASE_URL
 * like for `sync-store.db.spec.ts`; a scratch database is created and dropped afterwards.
 */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../apps/api/migrations',
);
const DATABASE = 'pd_test_system_metrics';
const NOW = new Date('2026-11-01T12:00:00Z');
const HOUR_MS = 60 * 60 * 1000;

describe.skipIf(!ADMIN_URL)('SystemMetricsService', {timeout: 60_000}, () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  const userId = randomUUID();
  const connectionId = randomUUID();

  const metrics = (sync: Partial<SyncService>) =>
    new SystemMetricsService(db as unknown as Database, sync as SyncService);

  beforeAll(async () => {
    configureFieldEncryption('test-key-test-key-test-key-test-key');
    admin = new Pool({connectionString: ADMIN_URL});
    await admin.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DATABASE}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${DATABASE}`;
    pool = new Pool({connectionString: url.toString()});
    pool.on('error', () => undefined);
    db = drizzle({client: pool, casing: 'snake_case'});
    await migrate(db, {migrationsFolder: MIGRATIONS});
    await db.insert(users).values({
      id: userId,
      email: 'metrics@test.local',
      passwordHash: 'x',
      displayName: 'Test',
    });
    await db.insert(aiConnections).values({
      id: connectionId,
      userId,
      name: 'DeepSeek',
      provider: 'deepseek',
      baseUrl: 'http://x',
      model: 'm',
    });
    const usage = (day: string, requests: number, tokens: number) => ({
      userId,
      connectionId,
      day,
      model: 'm',
      requests,
      promptTokens: tokens,
      completionTokens: tokens / 2,
    });
    await db
      .insert(aiUsage)
      .values([usage('2026-11-01', 3, 1000), usage('2026-10-31', 50, 90_000)]);
    const note = (status: string, hoursAgo: number) => ({
      userId,
      source: 'finance',
      title: 'title',
      body: 'body',
      dedupeKey: randomUUID(),
      status: status as never,
      createdAt: new Date(NOW.getTime() - hoursAgo * HOUR_MS),
    });
    await db
      .insert(notificationOutbox)
      .values([
        note('sent', 1),
        note('sent', 2),
        note('failed', 3),
        note('held', 4),
        note('pending', 5),
        note('sent', 30),
        note('failed', 30),
      ]);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin?.end();
  });

  it("counts today's AI and the last day's notifications, not the older ones", async () => {
    const result = await metrics({mode: 'off'}).snapshot(NOW);

    expect(result.ai).toEqual({
      requests: 3,
      promptTokens: 1000,
      completionTokens: 500,
    });
    expect(result.notifications).toEqual({sent: 2, failed: 1, waiting: 2});
    expect(result.sync).toBeNull();
    expect(result.memoryMb).toBeGreaterThan(0);
  });

  it('takes the sync state from the sync service when sync is on', async () => {
    const result = await metrics({
      mode: 'client',
      status: async () =>
        ({
          lastSyncedAt: '2026-11-01T11:59:00.000Z',
          pendingChanges: 4,
          parked: 1,
        }) as never,
    }).snapshot(NOW);

    expect(result.sync).toEqual({
      lastAt: '2026-11-01T11:59:00.000Z',
      pending: 4,
      parked: 1,
    });
  });
});
