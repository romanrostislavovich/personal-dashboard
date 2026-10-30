import {DeviceAuthService} from '@pd/api-core';
import {configureFieldEncryption} from '@pd/api-core/schema';
import {sql} from 'drizzle-orm';
import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {DevicesService} from './devices.service';
import {PhoneNotificationsService} from './phone-notifications.service';

/** Runs against the generated migrations, like devices.db.spec.ts. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../apps/api/migrations',
);
const DB_NAME = `activity_phone_notifications_test_${process.pid}`;

describe.skipIf(!ADMIN_URL)(
  "the phone's notifications",
  {timeout: 60_000},
  () => {
    let admin: Pool;
    let pool: Pool;
    let db: NodePgDatabase;
    let devices: DevicesService;
    let notifications: PhoneNotificationsService;
    const userId = randomUUID();

    beforeAll(async () => {
      configureFieldEncryption(
        'phone-notifications-database-test-encryption-key',
      );
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
      VALUES (${userId}, 'phone@test', 'hash', 'Test', 'en', 'Europe/Warsaw')`);
      devices = new DevicesService(db as never, new DeviceAuthService());
      const users = {
        findById: async () => ({timeZone: 'Europe/Warsaw'}),
        timeZoneOf: (user: {timeZone: string}) => user.timeZone,
      };
      notifications = new PhoneNotificationsService(
        db as never,
        users as never,
      );
    }, 60_000);

    afterAll(async () => {
      await pool?.end();
      await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
      await admin?.end();
    });

    it('writes them once, keeps the text encrypted and sums them up by the user’s hours', async () => {
      const phone = await devices.register(userId, {
        name: 'Redmi',
        platform: 'android',
      });
      const device = await devices.authenticate(`Device ${phone.token}`);
      const batch = [
        // 23:30 and 23:45 in Warsaw (UTC+2), the same day.
        {
          app: 'com.instagram.android',
          appName: 'Instagram',
          title: 'Anna',
          text: 'liked your photo',
          postedAt: '2026-10-24T21:30:00.000Z',
        },
        {
          app: 'com.instagram.android',
          appName: 'Instagram',
          title: 'Ben',
          text: 'started following',
          postedAt: '2026-10-24T21:45:00.000Z',
        },
        {
          app: 'com.linkedin.android',
          appName: 'LinkedIn',
          title: 'Jobs',
          text: '5 new jobs',
          postedAt: '2026-10-24T08:00:00.000Z',
        },
      ];
      expect(await notifications.ingest(device, batch)).toBe(3);
      // The answer was lost and the phone sends the same again.
      expect(await notifications.ingest(device, batch)).toBe(0);

      const raw = await db.execute(
        sql`SELECT text FROM activity_phone_notifications`,
      );
      expect(JSON.stringify(raw.rows)).not.toContain('liked your photo');

      const summary = await notifications.summary(userId, {
        from: '2026-10-24',
        to: '2026-10-24',
      });
      expect(summary.total).toBe(3);
      expect(summary.byApp[0]).toEqual({
        app: 'com.instagram.android',
        appName: 'Instagram',
        count: 2,
      });
      expect(summary.byHour[23]).toBe(2);
      expect(summary.byHour[10]).toBe(1);
      expect(summary.byDay).toEqual([{day: '2026-10-24', count: 3}]);
      expect(summary.latest[0]).toMatchObject({
        title: 'Ben',
        text: 'started following',
      });
    });
  },
);
