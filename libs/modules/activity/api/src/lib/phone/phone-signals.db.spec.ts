import { configureFieldEncryption } from '@pd/api-core/schema';
import { sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from 'pg';
import { DevicesService } from '../devices.service';
import { PhoneSignalsService } from './phone-signals.service';

/** Runs against the generated migrations, like devices.db.spec.ts. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(import.meta.dirname, '../../../../../../../apps/api/migrations');
const DB_NAME = `activity_phone_signals_test_${process.pid}`;

describe.skipIf(!ADMIN_URL)("the phone's signals", { timeout: 60_000 }, () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let devices: DevicesService;
  let signals: PhoneSignalsService;
  const userId = randomUUID();

  beforeAll(async () => {
    configureFieldEncryption('phone-signals-database-test-encryption-key');
    admin = new Pool({ connectionString: ADMIN_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${DB_NAME}`;
    pool = new Pool({ connectionString: url.toString() });
    pool.on('error', () => undefined);
    db = drizzle({ client: pool, casing: 'snake_case' });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name, locale, time_zone)
      VALUES (${userId}, 'signals@test', 'hash', 'Test', 'en', 'Europe/Warsaw')`);
    devices = new DevicesService(db as never);
    const users = {
      findById: async () => ({ timeZone: 'Europe/Warsaw' }),
      timeZoneOf: (user: { timeZone: string }) => user.timeZone,
    };
    signals = new PhoneSignalsService(db as never, users as never);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin?.end();
  });

  it('writes the signals once and encrypted, keeps the latest number of a day, and counts the day', async () => {
    const phone = await devices.register(userId, { name: 'Redmi', platform: 'android' });
    const device = await devices.authenticate(`Device ${phone.token}`);
    // Warsaw is UTC+2 on 2026-10-20.
    const batch = {
      signals: [
        { kind: 'screenOn' as const, at: '2026-10-20T05:10:00.000Z' },
        {
          kind: 'call' as const,
          at: '2026-10-20T08:00:00.000Z',
          data: { seconds: 90, who: 'a1', type: 'out' },
        },
        { kind: 'wifi' as const, at: '2026-10-20T09:00:00.000Z', data: { ssid: 'Home-5G' } },
      ],
      daily: [{ day: '2026-10-20', kind: 'steps' as const, key: '', value: 4000 }],
    };
    expect(await signals.ingest(device, batch)).toEqual({ saved: 3 });
    expect(
      await signals.ingest(device, {
        signals: batch.signals,
        daily: [{ day: '2026-10-20', kind: 'steps', key: '', value: 6500 }],
      }),
    ).toEqual({ saved: 0 });

    const raw = await db.execute(sql`SELECT data FROM activity_phone_signals WHERE kind = 'wifi'`);
    expect(String(raw.rows[0]['data'])).not.toContain('Home-5G');

    const [day] = await signals.days(userId, { from: '2026-10-20', to: '2026-10-20' });
    expect(day).toMatchObject({
      day: '2026-10-20',
      firstUse: '07:10',
      steps: 6500,
      calls: 1,
      people: 1,
    });
  });
});
