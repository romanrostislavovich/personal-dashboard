import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from 'pg';
import { Database } from '../database/database.module';
import { users } from '../users/users.schema';
import { AccessTokensService } from './access-tokens.service';

/**
 * Access tokens on a real database. Needs PostgreSQL: set TEST_DATABASE_URL like for
 * `sync-store.db.spec.ts`; a scratch database is created and dropped afterwards.
 */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(import.meta.dirname, '../../../../../../apps/api/migrations');
const DATABASE = 'pd_test_access_tokens';

describe.skipIf(!ADMIN_URL)('AccessTokensService', { timeout: 60_000 }, () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let tokens: AccessTokensService;
  const userId = randomUUID();

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
      .values({ id: userId, email: 'mcp@test.local', passwordHash: 'x', displayName: 'Test' });
    tokens = new AccessTokensService(db as unknown as Database);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin?.end();
  });

  it('lets a token in until it is revoked, and keeps only its hash', async () => {
    const made = await tokens.create(userId, { name: 'Claude Desktop', scope: 'read' });
    expect(made.token.startsWith('pd_')).toBe(true);
    expect(made.hint).toBe(made.token.slice(0, 7));

    expect(await tokens.authenticate(`Bearer ${made.token}`)).toEqual({
      userId,
      scope: 'read',
      tokenId: made.id,
    });
    expect(await tokens.authenticate(`Bearer ${made.token}x`)).toBeNull();
    expect(await tokens.authenticate('Bearer eyJhbGciOi.session.token')).toBeNull();
    expect(await tokens.authenticate(undefined)).toBeNull();

    const [listed] = await tokens.list(userId);
    expect(listed).toMatchObject({ name: 'Claude Desktop', scope: 'read' });
    expect(listed.lastUsedAt).not.toBeNull();
    expect(JSON.stringify(listed)).not.toContain(made.token);

    await tokens.revoke(userId, made.id);
    expect(await tokens.authenticate(`Bearer ${made.token}`)).toBeNull();
    await expect(tokens.revoke(randomUUID(), made.id)).rejects.toThrow();
  });
});
