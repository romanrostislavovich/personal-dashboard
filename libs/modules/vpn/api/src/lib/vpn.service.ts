import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {Database, DB, UsersService} from '@pd/api-core';
import {
  addDays,
  parseLocalDate,
  toLocalDate,
  VpnDay,
  VpnDevice,
  VpnDeviceConfig,
  VpnDeviceInput,
  VpnDeviceRename,
  VpnState,
  VpnStatus,
  zonedDateTime,
} from '@pd/contracts';
import {and, asc, desc, eq, gte, inArray, sql, sum} from 'drizzle-orm';
import {
  deviceConfig,
  freeAddress,
  generateKeyPair,
  generatePresharedKey,
  ONLINE_HANDSHAKE_SECONDS,
} from './awg-config';
import {vpnDays, vpnDevices, vpnNetworks, vpnServers} from './vpn.schema';

/** The container writes its status every 30 seconds: older than this, it is not running. */
export const STATUS_STALE_MS = 3 * 60_000;

type DeviceRow = typeof vpnDevices.$inferSelect;
type ServerRow = typeof vpnServers.$inferSelect;

/** The devices of the VPN and what the server knows about them; every query filters by `userId`. */
@Injectable()
export class VpnService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  async status(userId: string): Promise<VpnStatus> {
    const server = await this.server(userId);
    const rows = await this.db
      .select()
      .from(vpnDevices)
      .where(eq(vpnDevices.userId, userId))
      .orderBy(asc(vpnDevices.createdAt));
    const today = await this.today(userId);
    const days = rows.length
      ? await this.db
          .select({
            deviceId: vpnDays.deviceId,
            bytes: sql<number>`(${vpnDays.rxBytes} + ${vpnDays.txBytes})::float8`,
          })
          .from(vpnDays)
          .where(and(eq(vpnDays.userId, userId), eq(vpnDays.day, today)))
      : [];
    const networks = rows.length
      ? await this.db
          .select()
          .from(vpnNetworks)
          .where(
            and(
              eq(vpnNetworks.userId, userId),
              inArray(
                vpnNetworks.deviceId,
                rows.map(row => row.id),
              ),
            ),
          )
          .orderBy(desc(vpnNetworks.lastSeenAt))
      : [];
    const devices = rows.map(row => ({
      ...toDevice(row),
      todayBytes: days
        .filter(day => day.deviceId === row.id)
        .reduce((total, day) => total + day.bytes, 0),
      networks: networks
        .filter(network => network.deviceId === row.id)
        .map(network => ({
          network: network.network,
          address: network.address,
          firstSeenAt: network.firstSeenAt.toISOString(),
          lastSeenAt: network.lastSeenAt.toISOString(),
        })),
    }));
    const [all] = await this.db
      .select({
        bytes: sql<number>`coalesce(sum(${vpnDays.rxBytes} + ${vpnDays.txBytes}), 0)::float8`,
      })
      .from(vpnDays)
      .where(and(eq(vpnDays.userId, userId), eq(vpnDays.day, today)));
    return {
      state: this.stateOf(server),
      endpoint: server ? `${server.host}:${server.port}` : null,
      statusAt: server?.statusAt?.toISOString() ?? null,
      devices,
      todayBytes: all?.bytes ?? 0,
    };
  }

  /** The last `count` days of all devices, oldest first; days without traffic are missing. */
  async days(userId: string, count: number): Promise<VpnDay[]> {
    const from = toLocalDate(
      addDays(parseLocalDate(await this.today(userId)), 1 - count),
    );
    const rows = await this.db
      .select({
        day: vpnDays.day,
        rxBytes: sum(vpnDays.rxBytes).mapWith(Number),
        txBytes: sum(vpnDays.txBytes).mapWith(Number),
        // Two devices online in the same minute are one minute of the day, not two; the
        // longest device's minutes are the closest that the counts tell.
        onlineMinutes: sql<number>`max(${vpnDays.onlineMinutes})::int`,
      })
      .from(vpnDays)
      .where(and(eq(vpnDays.userId, userId), gte(vpnDays.day, from)))
      .groupBy(vpnDays.day)
      .orderBy(asc(vpnDays.day));
    return rows;
  }

  async deviceConfig(userId: string, id: string): Promise<VpnDeviceConfig> {
    const device = await this.device(userId, id);
    const server = await this.requireServer(userId);
    return {
      name: device.name,
      config: deviceConfig(device, {
        publicKey: server.publicKey,
        host: server.host,
        port: server.port,
        obfuscation: server.obfuscation,
      }),
    };
  }

  async addDevice(userId: string, input: VpnDeviceInput): Promise<VpnDevice> {
    await this.requireServer(userId);
    const keys = generateKeyPair();
    return this.db.transaction(async tx => {
      // One address per device: two added at once must not get the same one.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`vpn:${userId}`}))`,
      );
      const taken = await tx
        .select({address: vpnDevices.address})
        .from(vpnDevices)
        .where(eq(vpnDevices.userId, userId));
      const address = freeAddress(taken.map(row => row.address));
      if (!address) {
        throw new BadRequestException('No free address left in the VPN');
      }
      const [row] = await tx
        .insert(vpnDevices)
        .values({
          userId,
          name: input.name,
          kind: input.kind,
          privateKey: keys.privateKey,
          publicKey: keys.publicKey,
          presharedKey: generatePresharedKey(),
          address,
        })
        .returning();
      return {...toDevice(row), todayBytes: 0, networks: []};
    });
  }

  async renameDevice(
    userId: string,
    id: string,
    input: VpnDeviceRename,
  ): Promise<VpnDevice> {
    const [row] = await this.db
      .update(vpnDevices)
      .set({name: input.name, updatedAt: new Date()})
      .where(and(eq(vpnDevices.id, id), eq(vpnDevices.userId, userId)))
      .returning();
    if (!row) {
      throw new NotFoundException();
    }
    return {...toDevice(row), todayBytes: 0, networks: []};
  }

  /** The device's key stops working within a minute, when the server writes its peers again. */
  async removeDevice(userId: string, id: string): Promise<void> {
    const deleted = await this.db
      .delete(vpnDevices)
      .where(and(eq(vpnDevices.id, id), eq(vpnDevices.userId, userId)))
      .returning({id: vpnDevices.id});
    if (!deleted.length) {
      throw new NotFoundException();
    }
  }

  server(userId: string): Promise<ServerRow | undefined> {
    return this.db
      .select()
      .from(vpnServers)
      .where(eq(vpnServers.userId, userId))
      .then(rows => rows[0]);
  }

  /** Today in the user's time zone. */
  async today(userId: string): Promise<string> {
    const timeZone = this.users.timeZoneOf(await this.users.findById(userId));
    return zonedDateTime(new Date(), timeZone).date;
  }

  private stateOf(server: ServerRow | undefined): VpnState {
    if (!server) {
      return 'off';
    }
    if (!server.statusAt) {
      return 'starting';
    }
    return Date.now() - server.statusAt.getTime() < STATUS_STALE_MS
      ? 'up'
      : 'down';
  }

  private async requireServer(userId: string): Promise<ServerRow> {
    const server = await this.server(userId);
    if (!server) {
      // Only the server with deploy/vpn makes one, for its owner.
      throw new BadRequestException('This dashboard has no VPN server');
    }
    return server;
  }

  private async device(userId: string, id: string): Promise<DeviceRow> {
    const [row] = await this.db
      .select()
      .from(vpnDevices)
      .where(and(eq(vpnDevices.id, id), eq(vpnDevices.userId, userId)));
    if (!row) {
      throw new NotFoundException();
    }
    return row;
  }
}

function toDevice(row: DeviceRow): Omit<VpnDevice, 'todayBytes' | 'networks'> {
  const handshake = row.lastHandshakeAt?.getTime() ?? 0;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    address: row.address,
    createdAt: row.createdAt.toISOString(),
    firstConnectedAt: row.firstConnectedAt?.toISOString() ?? null,
    lastHandshakeAt: row.lastHandshakeAt?.toISOString() ?? null,
    online: Date.now() - handshake < ONLINE_HANDSHAKE_SECONDS * 1000,
    lastAddress: row.lastAddress,
  };
}
