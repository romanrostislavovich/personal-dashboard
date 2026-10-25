import { configureFieldEncryption } from '@pd/api-core/schema';
import { sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from 'pg';
import { DevicesService } from '../devices.service';
import { PlacesService } from './places.service';

/** Runs against the generated migrations, like devices.db.spec.ts. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(import.meta.dirname, '../../../../../../../apps/api/migrations');
const DB_NAME = `activity_places_test_${process.pid}`;

const HOME = { latitude: 52.2297, longitude: 21.0122 };
const WORK = { latitude: 52.2477, longitude: 21.0322 };

/** Every 15 minutes at a place, between two moments of 2026-10-20 in UTC (`HH:MM`). */
function every15(from: string, to: string, place: typeof HOME) {
  const fixes = [];
  const end = Date.parse(`2026-10-20T${to}:00Z`);
  for (let at = Date.parse(`2026-10-20T${from}:00Z`); at <= end; at += 15 * 60_000) {
    fixes.push({ at: new Date(at).toISOString(), ...place, accuracy: 25 });
  }
  return fixes;
}

describe.skipIf(!ADMIN_URL)("the phone's places", { timeout: 60_000 }, () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let devices: DevicesService;
  let places: PlacesService;
  const userId = randomUUID();

  beforeAll(async () => {
    configureFieldEncryption('places-database-test-encryption-key');
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
      VALUES (${userId}, 'places@test', 'hash', 'Test', 'en', 'Europe/Warsaw')`);
    devices = new DevicesService(db as never);
    const users = {
      findById: async () => ({ timeZone: 'Europe/Warsaw' }),
      timeZoneOf: (user: { timeZone: string }) => user.timeZone,
    };
    places = new PlacesService(db as never, users as never);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin?.end();
  });

  it('writes the fixes once and encrypted, and tells the day as stays and a trip', async () => {
    const phone = await devices.register(userId, { name: 'Redmi', platform: 'android' });
    const device = await devices.authenticate(`Device ${phone.token}`);
    const fixes = [...every15('05:00', '07:00', HOME), ...every15('07:30', '15:00', WORK)];
    expect(await places.ingest(device, fixes)).toBe(fixes.length);
    // The answer was lost and the phone sent the batch again.
    expect(await places.ingest(device, fixes)).toBe(0);

    const raw = await db.execute(sql`SELECT point FROM activity_phone_locations LIMIT 1`);
    expect(String(raw.rows[0]['point'])).not.toContain('52.2');

    const day = await places.overview(userId, '2026-10-20');
    expect(day.points).toBe(fixes.length);
    expect(day.entries.map((entry) => entry.kind)).toEqual(['stay', 'trip', 'stay']);
    expect(day.meters).toBeGreaterThan(2200);
    expect(day.frequent).toHaveLength(2);
    expect(day.frequent[0].seconds).toBeGreaterThan(day.frequent[1].seconds);
  });

  it('a named place gives its name to the stays in it', async () => {
    const home = await places.addPlace(userId, { name: 'Home', radiusM: 150, ...HOME });
    const day = await places.overview(userId, '2026-10-20');
    expect(day.entries[0]).toMatchObject({ kind: 'stay', placeId: home.id, name: 'Home' });
    expect(day.frequent.find((place) => place.placeId === home.id)?.name).toBe('Home');

    await places.renamePlace(userId, home.id, 'Flat');
    expect((await places.named(userId))[0].name).toBe('Flat');
    await places.removePlace(userId, home.id);
    expect(await places.named(userId)).toEqual([]);
  });
});
