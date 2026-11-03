import {configureFieldEncryption} from '@pd/api-core/schema';
import {sql} from 'drizzle-orm';
import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {mkdtemp, readFile, rm, utimes, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Pool} from 'pg';
import {VpnServerService} from './vpn-server.service';
import {VpnService} from './vpn.service';

/**
 * The VPN on a real database and a folder in place of the container's: the peers it is given,
 * the status it writes read back. Needs PostgreSQL: set TEST_DATABASE_URL like for
 * `sync-store.db.spec.ts`.
 */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../apps/api/migrations',
);
const DATABASE = 'pd_test_vpn';

describe.skipIf(!ADMIN_URL)('the VPN', {timeout: 60_000}, () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let dir: string;
  let vpn: VpnService;
  let server: VpnServerService;
  const userId = randomUUID();
  const otherId = randomUUID();
  const sent: string[] = [];
  const emitted: unknown[] = [];
  const woken: Record<string, string>[] = [];
  let settings: Record<string, unknown>;

  /** What the container would write: a line per peer. */
  const status = async (
    lines: [string, string, number, number, number][],
    ageMs = 0,
  ) => {
    const path = join(dir, 'status.tsv');
    await writeFile(path, lines.map(line => line.join('\t')).join('\n'));
    const at = new Date(Date.now() - ageMs);
    await utimes(path, at, at);
  };
  const seconds = () => Math.floor(Date.now() / 1000);
  /** A minute that is not a quarter of an hour: the bytes stay pending. */
  const quiet = new Date('2026-11-03T12:07:00Z');
  /** The row's version: a synced row written again changes it, and the sync sends it. */
  const versions = async (table: 'vpn_devices' | 'vpn_servers') =>
    (
      await db.execute<{xmin: string}>(
        sql`SELECT xmin::text FROM ${sql.identifier(table)} ORDER BY id`,
      )
    ).rows.map(row => row.xmin);

  beforeAll(async () => {
    configureFieldEncryption('vpn-database-test-encryption-key-not-real');
    admin = new Pool({connectionString: ADMIN_URL});
    await admin.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DATABASE}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${DATABASE}`;
    pool = new Pool({connectionString: url.toString()});
    pool.on('error', () => undefined);
    db = drizzle({client: pool, casing: 'snake_case'});
    await migrate(db, {migrationsFolder: MIGRATIONS});
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name)
      VALUES (${userId}, 'vpn@test.local', 'x', 'Test'),
             (${otherId}, 'other-vpn@test.local', 'x', 'Other')`);
    dir = await mkdtemp(join(tmpdir(), 'pd-vpn-'));
    const owner = {id: userId, locale: 'en', timeZone: 'UTC'};
    const users = {
      owner: async () => owner,
      findById: async () => owner,
      timeZoneOf: () => 'UTC',
    };
    settings = {
      VPN_DIR: dir,
      VPN_PORT: 37853,
      PUBLIC_URL: 'https://dash.example.com',
    };
    const config = {get: (key: string) => settings[key]};
    const notifications = {
      send: async (_: string, notification: {title: string}) => {
        sent.push(notification.title);
      },
    };
    const realtime = {emit: (_: string, event: unknown) => emitted.push(event)};
    const push = {
      wake: async (_: string, kind: string, extra: Record<string, string>) => {
        woken.push({kind, ...extra});
        return 1;
      },
    };
    vpn = new VpnService(
      db as never,
      config as never,
      users as never,
      realtime as never,
      push as never,
    );
    server = new VpnServerService(
      db as never,
      config as never,
      users as never,
      notifications as never,
      vpn,
    );
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin?.end();
    if (dir) {
      await rm(dir, {recursive: true, force: true});
    }
  });

  it('refuses a device before the server made its keys', async () => {
    await expect(
      vpn.addDevice(userId, {name: 'Early', kind: 'phone'}),
    ).rejects.toMatchObject({response: {reason: 'no-server'}});
  });

  it('makes its keys once and gives a device a config to the name, not the address', async () => {
    await server.tick(quiet);
    expect((await vpn.status(userId)).state).toBe('starting');
    expect((await vpn.status(userId)).endpoint).toBe(
      'vpn.dash.example.com:37853',
    );

    const phone = await vpn.addDevice(userId, {name: 'Phone', kind: 'phone'});
    expect(phone.address).toBe('10.77.0.2');
    const {config} = await vpn.deviceConfig(userId, phone.id);
    expect(config).toContain('Endpoint = vpn.dash.example.com:37853');

    await server.tick(quiet);
    const peers = await readFile(join(dir, 'awg0.conf'), 'utf8');
    expect(peers).toContain('AllowedIPs = 10.77.0.2/32');
    expect(peers).not.toContain('Endpoint');
  });

  it('gives devices the public port while the container keeps listening on its own', async () => {
    settings['VPN_PUBLIC_PORT'] = 443;
    await server.tick(quiet);
    const [device] = (await vpn.status(userId)).devices;
    expect((await vpn.deviceConfig(userId, device.id)).config).toContain(
      'Endpoint = vpn.dash.example.com:443',
    );
    expect(await readFile(join(dir, 'awg0.conf'), 'utf8')).toContain(
      'ListenPort = 37853',
    );
    delete settings['VPN_PUBLIC_PORT'];
    await server.tick(quiet);
  });

  it('switches a device: the desktop apps live, a phone by a silent push', async () => {
    const [phone] = (await vpn.status(userId)).devices;
    expect(await vpn.switchDevice(userId, phone.id, true)).toEqual({
      device: 'Phone',
      up: true,
      phones: 1,
    });
    expect(emitted.at(-1)).toEqual({
      type: 'vpn',
      deviceId: phone.id,
      up: true,
      killSwitch: true,
    });
    expect(woken.at(-1)).toEqual({kind: 'vpn', device: phone.id, up: '1'});
    await expect(
      vpn.switchDevice(otherId, phone.id, true),
    ).rejects.toMatchObject({status: 404});
  });

  it("keeps another user's devices out of reach", async () => {
    const [device] = (await vpn.status(userId)).devices;
    await expect(vpn.deviceConfig(otherId, device.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      vpn.updateDevice(otherId, device.id, {name: 'Mine'}),
    ).rejects.toMatchObject({status: 404});
    await expect(vpn.removeDevice(otherId, device.id)).rejects.toMatchObject({
      status: 404,
    });
    expect((await vpn.status(otherId)).devices).toEqual([]);
  });

  it('counts the traffic, adds it to the day on a quarter, tells the first connection and a new network', async () => {
    const [device] = (await vpn.status(userId)).devices;
    const [{public_key: key}] = (
      await db.execute<{public_key: string}>(
        sql`SELECT public_key FROM vpn_devices WHERE id = ${device.id}`,
      )
    ).rows;
    const synced = [
      await versions('vpn_devices'),
      await versions('vpn_servers'),
    ];

    await status([[key, '93.84.1.2:5000', seconds(), 1000, 5000]]);
    await server.tick(quiet);
    await status([[key, '93.84.7.9:5001', seconds(), 1500, 9000]]);
    await server.tick(quiet);

    // The minutes' looks write only the unsynced state: the synced rows stay as they were.
    expect([
      await versions('vpn_devices'),
      await versions('vpn_servers'),
    ]).toEqual(synced);
    const now = await vpn.status(userId);
    expect(now.state).toBe('up');
    expect(now.devices[0].online).toBe(true);
    expect(now.todayBytes).toBe(9000 + 1500);
    expect(await vpn.days(userId, 1)).toEqual([]);
    expect(sent).toEqual(['🔐 Phone is in the VPN']);

    await server.tick(new Date('2026-11-03T12:15:00Z'));
    expect((await vpn.days(userId, 1))[0]).toMatchObject({
      rxBytes: 1500,
      txBytes: 9000,
      // The quarter's own look counts too: three minutes online.
      onlineMinutes: 3,
    });
    expect((await vpn.status(userId)).todayBytes).toBe(9000 + 1500);

    // The same city's network is not new; another country's is.
    await status([[key, '185.1.2.3:6000', seconds(), 1600, 9100]]);
    await server.tick(quiet);
    expect(sent.at(-1)).toBe('🌍 Phone: the VPN from a new network');
    expect((await vpn.status(userId)).devices[0].networks).toHaveLength(2);
  });

  it('tells the VPN down once and back up once', async () => {
    sent.length = 0;
    await status([], 10 * 60_000);
    await server.tick(quiet);
    await server.tick(quiet);
    expect((await vpn.status(userId)).state).toBe('down');
    await status([]);
    await server.tick(quiet);
    expect(sent).toEqual(['🔴 The VPN is down', '🟢 The VPN is back']);
  });

  it('a deleted device leaves the peers, its days stay', async () => {
    const [device] = (await vpn.status(userId)).devices;
    await server.flush(userId);
    await vpn.removeDevice(userId, device.id);
    await server.tick(quiet);
    expect(await readFile(join(dir, 'awg0.conf'), 'utf8')).not.toContain(
      '[Peer]',
    );
    expect((await vpn.days(userId, 1))[0].txBytes).toBe(9100);
    expect((await vpn.status(userId)).todayBytes).toBe(9100 + 1600);
  });

  it('refuses a device when all 253 addresses are taken', async () => {
    await db.execute(sql`INSERT INTO vpn_devices
      (user_id, name, kind, private_key, public_key, preshared_key, address)
      SELECT ${userId}, 'D' || n, 'other', 'x', 'k' || n, 'x', '10.77.0.' || n
      FROM generate_series(2, 254) n`);
    await expect(
      vpn.addDevice(userId, {name: 'One more', kind: 'phone'}),
    ).rejects.toMatchObject({response: {reason: 'full'}});
  });
});
