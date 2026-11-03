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
  const sent: string[] = [];

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
      VALUES (${userId}, 'vpn@test.local', 'x', 'Test')`);
    dir = await mkdtemp(join(tmpdir(), 'pd-vpn-'));
    const owner = {id: userId, locale: 'en', timeZone: 'UTC'};
    const users = {
      owner: async () => owner,
      findById: async () => owner,
      timeZoneOf: () => 'UTC',
    };
    const settings: Record<string, unknown> = {
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
    vpn = new VpnService(db as never, users as never);
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

  it('makes its keys once and gives a device a config to the name, not the address', async () => {
    await server.tick();
    expect((await vpn.status(userId)).state).toBe('starting');
    expect((await vpn.status(userId)).endpoint).toBe(
      'vpn.dash.example.com:37853',
    );

    const phone = await vpn.addDevice(userId, {name: 'Phone', kind: 'phone'});
    expect(phone.address).toBe('10.77.0.2');
    const {config} = await vpn.deviceConfig(userId, phone.id);
    expect(config).toContain('Endpoint = vpn.dash.example.com:37853');

    await server.tick();
    const peers = await readFile(join(dir, 'awg0.conf'), 'utf8');
    expect(peers).toContain('AllowedIPs = 10.77.0.2/32');
    expect(peers).not.toContain('Endpoint');
  });

  it('counts the traffic of the day, tells the first connection and a new network', async () => {
    const [device] = (await vpn.status(userId)).devices;
    const [{public_key: key}] = (
      await db.execute<{public_key: string}>(
        sql`SELECT public_key FROM vpn_devices WHERE id = ${device.id}`,
      )
    ).rows;

    await status([[key, '93.84.1.2:5000', seconds(), 1000, 5000]]);
    await server.tick();
    await status([[key, '93.84.7.9:5001', seconds(), 1500, 9000]]);
    await server.tick();

    const now = await vpn.status(userId);
    expect(now.state).toBe('up');
    expect(now.devices[0].online).toBe(true);
    expect(now.todayBytes).toBe(9000 + 1500);
    expect((await vpn.days(userId, 1))[0].onlineMinutes).toBe(2);
    expect(sent).toEqual(['🔐 Phone is in the VPN']);

    // The same city's network is not new; another country's is.
    await status([[key, '185.1.2.3:6000', seconds(), 1600, 9100]]);
    await server.tick();
    expect(sent.at(-1)).toBe('🌍 Phone: the VPN from a new network');
    expect(now.devices[0].networks).toHaveLength(1);
  });

  it('tells the VPN down once and back up once', async () => {
    sent.length = 0;
    await status([], 10 * 60_000);
    await server.tick();
    await server.tick();
    expect((await vpn.status(userId)).state).toBe('down');
    await status([]);
    await server.tick();
    expect(sent).toEqual(['🔴 The VPN is down', '🟢 The VPN is back']);
  });

  it('a deleted device leaves the peers, its days stay', async () => {
    const [device] = (await vpn.status(userId)).devices;
    await vpn.removeDevice(userId, device.id);
    await server.tick();
    expect(await readFile(join(dir, 'awg0.conf'), 'utf8')).not.toContain(
      '[Peer]',
    );
    expect((await vpn.days(userId, 1))[0].txBytes).toBe(9100);
  });
});
