import { sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from 'pg';
import { ActivityService } from './activity.service';
import { SitesService } from './sites.service';

/** Needs PostgreSQL, see `sync-store.db.spec.ts` in api-core for how to run it. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(import.meta.dirname, '../../../../../../apps/api/migrations');
const DB_NAME = `activity_sites_test_${process.pid}`;

describe.skipIf(!ADMIN_URL)('SitesService', { timeout: 60_000 }, () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let sites: SitesService;
  const userId = randomUUID();
  const deviceId = randomUUID();
  const visit = (site: string, startedAt: string, minutes: number) => ({
    id: randomUUID(),
    site,
    startedAt,
    endedAt: new Date(new Date(startedAt).getTime() + minutes * 60_000).toISOString(),
  });

  beforeAll(async () => {
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
      VALUES (${userId}, 'sites@test', 'hash', 'Test', 'en')`);
    await db.execute(sql`INSERT INTO activity_devices (id, user_id, name, platform, token_hash)
      VALUES (${deviceId}, ${userId}, 'PC', 'windows', 'hash')`);
    await db.execute(sql`INSERT INTO activity_settings (user_id, private_words)
      VALUES (${userId}, '{bank}')`);
    await db.execute(sql`INSERT INTO activity_limits (user_id, kind, app, minutes)
      VALUES (${userId}, 'site', 'youtube.com', 30)`);
    const users = {
      findById: async () => ({ id: userId }),
      timeZoneOf: () => 'UTC',
    };
    const activity = new ActivityService(db as never, users as never, {} as never, {} as never);
    sites = new SitesService(db as never, activity);
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin?.end();
  });

  it('keeps the time of each site once, never of a private one, and counts it to its limit', async () => {
    // Early in today (UTC, the test user's zone): every visit falls on today's date.
    const day = new Date().toISOString().slice(0, 10);
    const at = (time: string) => `${day}T${time}:00Z`;
    const batch = [
      visit('youtube.com', at('00:01'), 10),
      visit('m.youtube.com', at('00:12'), 5),
      visit('github.com', at('00:20'), 15),
      visit('mybank.com', at('00:40'), 5),
      // A tab left open overnight counts half an hour at most.
      visit('reddit.com', at('00:00'), 500),
    ];
    expect(await sites.record(userId, batch)).toBe(4);
    // The same batch again (the answer was lost): nothing doubles.
    expect(await sites.record(userId, batch)).toBe(0);

    const times = await sites.times(userId, { from: day, to: day });
    expect(times).toEqual([
      { site: 'reddit.com', seconds: 1800 },
      { site: 'github.com', seconds: 900 },
      { site: 'youtube.com', seconds: 600 },
      { site: 'm.youtube.com', seconds: 300 },
    ]);

    const config = await sites.browserConfig(userId);
    expect(config.siteLimits).toEqual([{ site: 'youtube.com', minutes: 30, usedSeconds: 900 }]);
    expect(config.focusUntil).toBeNull();
  });

  it('tells the extension while a focus session of a desktop app runs', async () => {
    const until = new Date(Date.now() + 20 * 60_000).toISOString();
    await sites.setFocus({ id: deviceId } as never, until);
    expect((await sites.browserConfig(userId)).focusUntil).toBe(until);
    await sites.setFocus({ id: deviceId } as never, null);
    expect((await sites.browserConfig(userId)).focusUntil).toBeNull();
  });
});
