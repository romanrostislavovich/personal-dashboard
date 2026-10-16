import { eq, sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from 'pg';
import { configureFieldEncryption } from '../crypto/encrypted-columns';
import { Database } from '../database/database.module';
import { users } from '../users/users.schema';
import { NotificationOutbox } from './notification-outbox';
import { notificationOutbox } from './notifications.schema';

/**
 * The outbox on a real database. Needs PostgreSQL: set TEST_DATABASE_URL like for
 * `sync-store.db.spec.ts`; a scratch database is created and dropped afterwards.
 */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(import.meta.dirname, '../../../../../../apps/api/migrations');
const DATABASE = 'pd_test_notification_outbox';

describe.skipIf(!ADMIN_URL)('NotificationOutbox', { timeout: 60_000 }, () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let outbox: NotificationOutbox;
  const userId = randomUUID();
  const note = (title: string, dedupe?: { key: string; minutes: number }) => ({
    title,
    body: 'body',
    source: 'finance',
    dedupe,
  });

  beforeAll(async () => {
    configureFieldEncryption('test-key-test-key-test-key-test-key');
    admin = new Pool({ connectionString: ADMIN_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DATABASE}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${DATABASE}`;
    pool = new Pool({ connectionString: url.toString() });
    pool.on('error', () => undefined);
    db = drizzle({ client: pool, casing: 'snake_case' });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    await db
      .insert(users)
      .values({ id: userId, email: 'outbox@test.local', passwordHash: 'x', displayName: 'Test' });
    outbox = new NotificationOutbox(db as unknown as Database);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin?.end();
  });

  it('sends the same once within its window, even when asked at once', async () => {
    const [first, second] = await Promise.all([
      outbox.add(userId, note('Rent is due'), ['telegram'], 'sending'),
      outbox.add(userId, note('Rent is due'), ['telegram'], 'sending'),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(await outbox.add(userId, note('Another'), ['telegram'], 'sending')).not.toBeNull();

    const price = { key: 'wish:1', minutes: 60 };
    expect(await outbox.add(userId, note('Cheaper: 10', price), [], 'sent')).not.toBeNull();
    expect(await outbox.add(userId, note('Pricier: 12', price), [], 'sent')).toBeNull();

    const log = await outbox.log(userId);
    expect(log.week.deduplicated).toBe(2);
    // The text is kept encrypted and read back plain.
    expect(log.items.map((item) => item.title)).toContain('Rent is due');
    const { rows } = await db.execute<{ title: string }>(
      sql`SELECT title FROM notification_outbox LIMIT 1`,
    );
    expect(rows[0].title.startsWith('enc:v1:')).toBe(true);
  });

  it('tries a failed one again after the backoff, and gives up when it cannot help', async () => {
    const row = await outbox.add(userId, note('Retry me'), ['telegram'], 'sending');
    if (!row) {
      throw new Error('not added');
    }
    await outbox.failed(row, ['telegram'], 'Telegram 429', { retryAfterMs: 120_000 });
    expect(await outbox.claimDue(new Date(Date.now() + 60_000))).toEqual([]);
    const due = await outbox.claimDue(new Date(Date.now() + 121_000));
    expect(due.map((one) => one.title)).toEqual(['Retry me']);
    // Taken: a second run of the job at the same moment does not get it again.
    expect(await outbox.claimDue(new Date(Date.now() + 121_000))).toEqual([]);

    await outbox.failed(due[0], [], 'Telegram 403', { permanent: true });
    const [stored] = await db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.id, row.id));
    expect(stored.status).toBe('failed');
    expect(stored.attempts).toBe(2);
    expect(stored.nextAttemptAt).toBeNull();
  });

  it('picks up one stuck in sending, after its lease', async () => {
    const row = await outbox.add(userId, note('Stuck'), ['telegram'], 'sending');
    expect(await outbox.claimDue()).toEqual([]);
    const later = await outbox.claimDue(new Date(Date.now() + 16 * 60_000));
    expect(later.map((one) => one.id)).toContain(row?.id);
  });
});
