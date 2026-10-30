import {DeviceAuthService} from '@pd/api-core';
import {BadRequestException, NotFoundException} from '@nestjs/common';
import {sql} from 'drizzle-orm';
import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {DevicesService} from './devices.service';
import {WellbeingService} from './wellbeing.service';

/** Runs against the generated migrations, like sites.db.spec.ts. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../apps/api/migrations',
);
const DB_NAME = `activity_devices_test_${process.pid}`;

describe.skipIf(!ADMIN_URL)('merging devices', {timeout: 60_000}, () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let devices: DevicesService;
  const userId = randomUUID();
  const otherUserId = randomUUID();

  const span = (deviceId: string, startedAt: string, app = 'code') => sql`
    INSERT INTO activity_spans (user_id, device_id, app, app_name, title, started_at, ended_at, seconds)
    VALUES (${userId}, ${deviceId}, ${app}, ${app}, '', ${startedAt}, ${startedAt}::timestamptz + interval '1 minute', 60)`;
  const health = (deviceId: string, at: string) => sql`
    INSERT INTO activity_health (user_id, device_id, at, cpu, memory_used, memory_total, uptime_seconds, disks)
    VALUES (${userId}, ${deviceId}, ${at}, 0.5, 1, 2, 3, '[]'::jsonb)`;
  const count = async (
    table: 'activity_spans' | 'activity_health',
    deviceId: string,
  ) => {
    const {rows} = await db.execute<{n: number}>(
      sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)} WHERE device_id = ${deviceId}`,
    );
    return rows[0].n;
  };

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
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name, locale)
      VALUES (${userId}, 'devices@test', 'hash', 'Test', 'en'),
             (${otherUserId}, 'other-devices@test', 'hash', 'Other', 'en')`);
    devices = new DevicesService(db as never, new DeviceAuthService());
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin?.end();
  });

  it('hands the records to the other device and removes the merged one', async () => {
    const old = await devices.register(userId, {
      name: 'LRR',
      platform: 'windows',
    });
    const fresh = await devices.register(userId, {
      name: 'LRR',
      platform: 'windows',
    });
    await db.execute(span(old.id, '2026-10-20T10:00:00Z'));
    await db.execute(span(old.id, '2026-10-20T11:00:00Z'));
    // The same moment on both: the one the merged device had is dropped, not doubled.
    await db.execute(span(old.id, '2026-10-21T12:00:00Z', 'old'));
    await db.execute(span(fresh.id, '2026-10-21T12:00:00Z', 'fresh'));
    await db.execute(health(old.id, '2026-10-20T10:00:00Z'));
    await db.execute(health(old.id, '2026-10-21T12:00:00Z'));
    await db.execute(health(fresh.id, '2026-10-21T12:00:00Z'));

    await devices.merge(userId, old.id, fresh.id);

    expect((await devices.list(userId)).map(device => device.id)).toEqual([
      fresh.id,
    ]);
    expect(await count('activity_spans', fresh.id)).toBe(3);
    expect(await count('activity_health', fresh.id)).toBe(2);
    const {rows} = await db.execute<{app: string}>(
      sql`SELECT app FROM activity_spans WHERE started_at = '2026-10-21T12:00:00Z'`,
    );
    expect(rows.map(row => row.app)).toEqual(['fresh']);
  });

  it('refuses a device of another user and the device itself', async () => {
    const mine = await devices.register(userId, {
      name: 'Mine',
      platform: 'windows',
    });
    const theirs = await devices.register(otherUserId, {
      name: 'Theirs',
      platform: 'windows',
    });
    await db.execute(span(mine.id, '2026-10-19T10:00:00Z'));

    await expect(
      devices.merge(userId, mine.id, theirs.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      devices.merge(otherUserId, theirs.id, mine.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      devices.merge(userId, mine.id, mine.id),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await count('activity_spans', mine.id)).toBe(1);
  });

  it('lists the computers without the phones: a phone sends no load to show', async () => {
    const id = randomUUID();
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name, locale)
      VALUES (${id}, 'computers@test', 'hash', 'Test', 'en')`);
    const computer = await devices.register(id, {
      name: 'Desk',
      platform: 'windows',
    });
    await devices.register(id, {name: 'Phone', platform: 'android'});
    // Listing the computers reads only the database.
    const none = null as never;
    const wellbeing = new WellbeingService(
      db as never,
      none,
      none,
      none,
      none,
      none,
      none,
    );

    const listed = await wellbeing.computers(id);

    expect(listed.map(row => row.deviceId)).toEqual([computer.id]);
  });
});
