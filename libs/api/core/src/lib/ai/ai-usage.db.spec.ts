import { eq } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from 'pg';
import { Database } from '../database/database.module';
import { users } from '../users/users.schema';
import { aiConnections, aiUsage } from './ai.schema';
import { AiLimitError, AiUsageService, costOf } from './ai-usage.service';

/**
 * The tokens of the AI on a real database. Needs PostgreSQL: set TEST_DATABASE_URL like for
 * `sync-store.db.spec.ts`; a scratch database is created and dropped afterwards.
 */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(import.meta.dirname, '../../../../../../apps/api/migrations');
const DATABASE = 'pd_test_ai_usage';

describe('costOf', () => {
  it('counts the prompt and the answer at their prices, and nothing without them', () => {
    const tokens = { promptTokens: 2_000_000, completionTokens: 500_000, cachedTokens: 0 };
    expect(costOf(tokens, { priceInput: 0.25, priceOutput: 2 })).toBe(1.5);
    expect(costOf(tokens, { priceInput: null, priceOutput: 2 })).toBeNull();
  });
});

describe.skipIf(!ADMIN_URL)('AiUsageService', { timeout: 60_000 }, () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let usage: AiUsageService;
  const userId = randomUUID();
  const connectionId = randomUUID();
  const connection = { id: connectionId, baseUrl: 'http://x', model: 'm', apiKey: null };

  beforeAll(async () => {
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
      .values({ id: userId, email: 'usage@test.local', passwordHash: 'x', displayName: 'Test' });
    await db.insert(aiConnections).values({
      id: connectionId,
      userId,
      name: 'DeepSeek',
      provider: 'deepseek',
      baseUrl: 'http://x',
      model: 'm',
      priceInput: 1,
      priceOutput: 4,
      monthlyLimit: 5,
    });
    const usersService = {
      findById: async () => ({ id: userId }),
      timeZoneOf: () => 'UTC',
    };
    usage = new AiUsageService(db as unknown as Database, usersService as never);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin?.end();
  });

  it('adds the tokens of a day up, and stops the requests once the month costs the limit', async () => {
    const tokens = { promptTokens: 1_000_000, completionTokens: 500_000, cachedTokens: 800_000 };
    await usage.record(userId, connection, tokens);
    await usage.record(userId, connection, tokens);
    const rows = await db.select().from(aiConnections).where(eq(aiConnections.id, connectionId));
    const { today, month } = (await usage.summary(userId, rows)).get(connectionId) ?? {};
    expect(today).toEqual({
      requests: 2,
      promptTokens: 2_000_000,
      completionTokens: 1_000_000,
      cachedTokens: 1_600_000,
      cost: 6,
    });
    expect(month?.cost).toBe(6);
    await expect(usage.checkLimit(userId, connection)).rejects.toBeInstanceOf(AiLimitError);

    // A month ago does not count in this one.
    await db.update(aiUsage).set({ day: '2000-01-01' });
    await expect(usage.checkLimit(userId, connection)).resolves.toBeUndefined();
  });
});
