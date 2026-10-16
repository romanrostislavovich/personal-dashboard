import { configureFieldEncryption } from '@pd/api-core/schema';
import { sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from 'pg';
import sharp from 'sharp';
import { ScreenshotsService } from './screenshots.service';

/** Needs PostgreSQL, see `sync-store.db.spec.ts` in api-core for how to run it. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(import.meta.dirname, '../../../../../../apps/api/migrations');
const DB_NAME = `screenshots_test_${process.pid}`;

describe.skipIf(!ADMIN_URL)('ScreenshotsService', { timeout: 60_000 }, () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let service: ScreenshotsService;
  const userId = randomUUID();
  const png = (colour: string) =>
    sharp({ create: { width: 800, height: 400, channels: 3, background: colour } })
      .png()
      .toBuffer();

  beforeAll(async () => {
    configureFieldEncryption('test-key-test-key-test-key-test-key');
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
      VALUES (${userId}, 'shots@test', 'hash', 'Test', 'en')`);
    service = new ScreenshotsService(db as never);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin?.end();
  });

  it('keeps a file byte for byte, gives a taken name a free one, and replaces it in place', async () => {
    const red = await png('#ff0000');
    const name = '2026-10/2026-10-16 18-42-07.png';
    const first = await service.add(userId, name, { data: red, mimeType: 'image/png' });
    expect(first).toMatchObject({ name, width: 800, height: 400, size: red.length });
    expect(first.hash).toBe(createHash('sha256').update(red).digest('hex'));
    expect((await service.file(userId, first.id)).data.equals(red)).toBe(true);
    // The file itself is never kept as it is in the table.
    const { rows } = await db.execute<{ data: Buffer }>(sql`SELECT data FROM screenshots LIMIT 1`);
    expect(rows[0].data.equals(red)).toBe(false);

    const second = await service.add(userId, name, { data: red, mimeType: 'image/png' });
    expect(second.name).toBe('2026-10/2026-10-16 18-42-07 (2).png');

    const blue = await png('#0000ff');
    const replaced = await service.replace(userId, first.id, { data: blue, mimeType: 'image/png' });
    expect(replaced.id).toBe(first.id);
    expect(replaced.hash).not.toBe(first.hash);
    const thumbnail = await service.file(userId, first.id, true);
    expect(thumbnail.mimeType).toBe('image/webp');
    expect((await sharp(thumbnail.data).metadata()).width).toBe(360);

    await service.remove(userId, second.id);
    expect((await service.list(userId)).map((one) => one.id)).toEqual([first.id]);
    await expect(
      service.add(userId, '../escape.png', { data: blue, mimeType: 'image/png' }),
    ).rejects.toThrow();
  });
});
