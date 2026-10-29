import { DeviceAuthService } from '@pd/api-core';
import { sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from 'pg';
import { DevicesService } from '../devices.service';
import { PhoneUsageService } from './phone-usage.service';

/** Runs against the generated migrations, like devices.db.spec.ts. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(import.meta.dirname, '../../../../../../../apps/api/migrations');
const DB_NAME = `activity_phone_usage_test_${process.pid}`;

describe.skipIf(!ADMIN_URL)("the phone's unlocks and nights", { timeout: 60_000 }, () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let devices: DevicesService;
  let phone: PhoneUsageService;
  const userId = randomUUID();

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
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name, locale, time_zone)
      VALUES (${userId}, 'unlocks@test', 'hash', 'Test', 'en', 'Europe/Warsaw')`);
    devices = new DevicesService(db as never, new DeviceAuthService());
    const users = {
      findById: async () => ({ timeZone: 'Europe/Warsaw' }),
      timeZoneOf: (user: { timeZone: string }) => user.timeZone,
    };
    phone = new PhoneUsageService(db as never, users as never);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin?.end();
  });

  async function span(deviceId: string, startedAt: string, minutes: number): Promise<void> {
    const start = new Date(startedAt);
    const end = new Date(start.getTime() + minutes * 60_000);
    await db.execute(sql`INSERT INTO activity_spans
      (user_id, device_id, app, app_name, title, started_at, ended_at, seconds)
      VALUES (${userId}, ${deviceId}, 'com.instagram.android', 'Instagram', '',
        ${start.toISOString()}, ${end.toISOString()}, ${minutes * 60})`);
  }

  it('counts the unlocks once, by the user’s day and hour, and the night to the evening', async () => {
    const created = await devices.register(userId, { name: 'Redmi', platform: 'android' });
    const device = await devices.authenticate(`Device ${created.token}`);
    const computer = await devices.register(userId, { name: 'PC', platform: 'windows' });

    // Warsaw is UTC+2 on 2026-10-20: 08:05 and 08:40 local, and 23:30 local.
    const unlocks = [
      '2026-10-20T06:05:00.000Z',
      '2026-10-20T06:40:00.000Z',
      '2026-10-20T21:30:00.000Z',
    ];
    expect(await phone.ingest(device, unlocks)).toBe(3);
    // The answer was lost and the phone sent the batch again.
    expect(await phone.ingest(device, unlocks)).toBe(0);

    // The night of the 20th: 23:30 local, and 01:00 local on the 21st.
    await span(device.id, '2026-10-20T21:30:00.000Z', 20);
    await span(device.id, '2026-10-20T23:00:00.000Z', 10);
    // Daytime on the phone and a late night at the computer are not the phone's night.
    await span(device.id, '2026-10-20T10:00:00.000Z', 30);
    await span(computer.id, '2026-10-20T22:00:00.000Z', 60);

    const usage = await phone.usage(userId, { from: '2026-10-20', to: '2026-10-21' });
    expect(usage.days).toEqual([{ day: '2026-10-20', unlocks: 3, nightSeconds: 30 * 60 }]);
    expect(usage.unlocks).toBe(3);
    expect(usage.unlocksByHour[8]).toBe(2);
    expect(usage.unlocksByHour[23]).toBe(1);
  });
});
