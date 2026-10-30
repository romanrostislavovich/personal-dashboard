import {sql} from 'drizzle-orm';
import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {WearableService} from './wearable.service';

/** Runs against the generated migrations, like the other *.db.spec.ts. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../../apps/api/migrations',
);
const DB_NAME = `health_wearable_test_${process.pid}`;

describe.skipIf(!ADMIN_URL)("the band's days", {timeout: 60_000}, () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let wearable: WearableService;
  const userId = randomUUID();
  const fetchMock = vi.fn();
  /** What Google answers for the steps of a day; changed between the syncs. */
  let steps = '4000';

  beforeAll(async () => {
    admin = new Pool({connectionString: ADMIN_URL});
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${DB_NAME}`;
    pool = new Pool({connectionString: url.toString()});
    pool.on('error', () => undefined);
    db = drizzle({client: pool, casing: 'snake_case'});
    await migrate(db, {migrationsFolder: MIGRATIONS});
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name, locale, time_zone)
      VALUES (${userId}, 'band@test', 'hash', 'Test', 'en', 'Europe/Warsaw')`);
    await db.execute(
      sql`INSERT INTO health_wearable_accounts (user_id) VALUES (${userId})`,
    );
    const config = {get: () => 'https://dash.test/'};
    const secrets = {
      get: async () => 'refresh',
      has: async () => true,
      set: async () => undefined,
    };
    const keys = {
      get: async (key: string) =>
        key.endsWith('id') ? 'id.apps.googleusercontent.com' : 'secret',
      isOwner: async () => true,
    };
    wearable = new WearableService(
      config as never,
      db as never,
      secrets as never,
      keys as never,
    );
  }, 60_000);

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('https://oauth2.googleapis.com/token')) {
        return Response.json({access_token: 'access', expires_in: 3600});
      }
      if (url.includes('/steps/')) {
        return Response.json({
          rollupDataPoints: [
            {
              civilStartTime: {date: {year: 2026, month: 10, day: 25}},
              steps: {countSum: steps},
            },
          ],
        });
      }
      if (url.includes('/daily-heart-rate-variability/')) {
        return Response.json({
          dataPoints: [
            {
              dailyHeartRateVariability: {
                date: {year: 2026, month: 10, day: 25},
                averageHeartRateVariabilityMilliseconds: 44,
              },
            },
          ],
        });
      }
      return Response.json({});
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin?.end();
  });

  it('reads 8 weeks the first time in pieces of 14 days, then only the last days again', async () => {
    await wearable.sync(userId, '2026-10-26');
    const stepCalls = () =>
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/steps/'))
        .length;
    expect(stepCalls()).toBe(4);

    const [day] = await wearable.days(userId, {
      from: '2026-10-25',
      to: '2026-10-25',
    });
    expect(day).toMatchObject({
      day: '2026-10-25',
      steps: 4000,
      hrvMs: 44,
      sleepMinutes: null,
    });

    fetchMock.mockClear();
    steps = '9100';
    await wearable.sync(userId, '2026-10-26');
    expect(stepCalls()).toBe(1);
    const [again] = await wearable.days(userId, {
      from: '2026-10-25',
      to: '2026-10-25',
    });
    // Google added to the day: the row is replaced, not doubled.
    expect(again.steps).toBe(9100);
    expect((await wearable.status(userId)).lastSyncedAt).not.toBeNull();
  });

  it('keeps the error for Settings when Google refuses the consent', async () => {
    fetchMock.mockImplementation(
      async () => new Response('{"error":"invalid_grant"}', {status: 400}),
    );
    await expect(wearable.sync(userId, '2026-10-26')).rejects.toThrow();
    expect((await wearable.status(userId)).error).toContain('invalid_grant');
  });
});
