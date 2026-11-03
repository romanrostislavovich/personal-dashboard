import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {AppConfig, Database, DB, UsersService} from '@pd/api-core';
import {
  addDays,
  parseLocalDate,
  toLocalDate,
  VpnDay,
  VpnDevice,
  VpnDeviceConfig,
  VpnDeviceInput,
  VpnDeviceUpdate,
  VpnState,
  VpnStatus,
  zonedDateTime,
} from '@pd/contracts';
import {and, asc, desc, eq, gte, sql, sum} from 'drizzle-orm';
import {
  deviceConfig,
  freeAddress,
  generateKeyPair,
  generatePresharedKey,
  ONLINE_HANDSHAKE_SECONDS,
} from './awg-config';
import {
  vpnDays,
  vpnDevices,
  vpnDeviceState,
  vpnNetworks,
  vpnServers,
  vpnServerState,
} from './vpn.schema';

/** The container writes its status every 10 seconds: older than this, it is not running. */
export const STATUS_STALE_MS = 3 * 60_000;

/** Why a device cannot be added, for the page to say in the user's language. */
export type VpnRefusal = 'no-server' | 'full';

type DeviceRow = typeof vpnDevices.$inferSelect;
type ServerRow = typeof vpnServers.$inferSelect;
type StateRow = typeof vpnDeviceState.$inferSelect;

/**
 * The devices of the VPN and what the server knows about them; every query filters by `userId`.
 * The writes run on the server only (VpnServerActions): a sync client asks it.
 */
@Injectable()
export class VpnService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly users: UsersService,
  ) {}

  async status(userId: string): Promise<VpnStatus> {
    const server = await this.server(userId);
    const today = await this.today(userId);
    const rows = await this.db
      .select({device: vpnDevices, live: vpnDeviceState})
      .from(vpnDevices)
      .leftJoin(
        vpnDeviceState,
        and(
          eq(vpnDeviceState.deviceId, vpnDevices.id),
          eq(vpnDeviceState.userId, userId),
        ),
      )
      .where(eq(vpnDevices.userId, userId))
      .orderBy(asc(vpnDevices.createdAt));
    const days = await this.db
      .select({
        deviceId: vpnDays.deviceId,
        bytes: sql<number>`(${vpnDays.rxBytes} + ${vpnDays.txBytes})::float8`,
      })
      .from(vpnDays)
      .where(and(eq(vpnDays.userId, userId), eq(vpnDays.day, today)));
    const networks = await this.db
      .select()
      .from(vpnNetworks)
      .where(eq(vpnNetworks.userId, userId))
      .orderBy(desc(vpnNetworks.lastSeenAt));
    const devices = rows.map(({device, live}) => ({
      ...toDevice(device, live),
      // The day's bytes so far: added to the day every 15 minutes, the rest still pending.
      todayBytes:
        days
          .filter(day => day.deviceId === device.id)
          .reduce((total, day) => total + day.bytes, 0) +
        (live?.pendingDay === today ? live.pendingRx + live.pendingTx : 0),
      networks: networks
        .filter(network => network.deviceId === device.id)
        .map(network => ({
          network: network.network,
          address: network.address,
          firstSeenAt: network.firstSeenAt.toISOString(),
          lastSeenAt: network.lastSeenAt.toISOString(),
        })),
    }));
    // Days of deleted devices count too.
    const gone = days
      .filter(day => !rows.some(row => row.device.id === day.deviceId))
      .reduce((total, day) => total + day.bytes, 0);
    const [live] = await this.db
      .select()
      .from(vpnServerState)
      .where(eq(vpnServerState.userId, userId));
    return {
      state: this.stateOf(server, live?.statusAt ?? null),
      endpoint: server ? `${server.host}:${server.port}` : null,
      statusAt: live?.statusAt?.toISOString() ?? null,
      devices,
      todayBytes:
        devices.reduce((total, device) => total + device.todayBytes, 0) + gone,
      today,
    };
  }

  /** The last `count` days of all devices, oldest first; days without traffic are missing. */
  async days(userId: string, count: number): Promise<VpnDay[]> {
    const from = toLocalDate(
      addDays(parseLocalDate(await this.today(userId)), 1 - count),
    );
    return this.db
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
  }

  async deviceConfig(userId: string, id: string): Promise<VpnDeviceConfig> {
    const device = await this.device(userId, id);
    const server = await this.server(userId);
    if (!server) {
      throw refused('no-server');
    }
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

  /** On the server only (VpnServerActions). */
  async addDevice(userId: string, input: VpnDeviceInput): Promise<VpnDevice> {
    if (!(await this.server(userId))) {
      throw refused('no-server');
    }
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
        throw refused('full');
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
      return {...toDevice(row, null), todayBytes: 0, networks: []};
    });
  }

  /** On the server only (VpnServerActions). */
  async updateDevice(
    userId: string,
    id: string,
    input: VpnDeviceUpdate,
  ): Promise<void> {
    const renamed = await this.db
      .update(vpnDevices)
      .set({...input, updatedAt: new Date()})
      .where(and(eq(vpnDevices.id, id), eq(vpnDevices.userId, userId)))
      .returning({id: vpnDevices.id});
    if (!renamed.length) {
      throw new NotFoundException();
    }
  }

  /**
   * On the server only (VpnServerActions): the key stops working within a minute, when the
   * server writes its peers again.
   */
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

  private stateOf(
    server: ServerRow | undefined,
    statusAt: Date | null,
  ): VpnState {
    if (!server) {
      return 'off';
    }
    // The container is seen only where it runs: a sync client has the devices, not the VPN.
    if (!this.config.get('VPN_DIR', {infer: true})) {
      return 'remote';
    }
    if (!statusAt) {
      return 'starting';
    }
    return Date.now() - statusAt.getTime() < STATUS_STALE_MS ? 'up' : 'down';
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

/** A 400 whose `reason` the page turns into words (`vpn.errors.<reason>`). */
function refused(reason: VpnRefusal): BadRequestException {
  return new BadRequestException({
    message:
      reason === 'full'
        ? 'No free address left in the VPN'
        : 'This dashboard has no VPN server',
    reason,
  });
}

function toDevice(
  row: DeviceRow,
  live: StateRow | null,
): Omit<VpnDevice, 'todayBytes' | 'networks'> {
  const handshake = live?.lastHandshakeAt?.getTime() ?? 0;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    address: row.address,
    createdAt: row.createdAt.toISOString(),
    firstConnectedAt: live?.firstConnectedAt?.toISOString() ?? null,
    lastHandshakeAt: live?.lastHandshakeAt?.toISOString() ?? null,
    online: Date.now() - handshake < ONLINE_HANDSHAKE_SECONDS * 1000,
    lastAddress: live?.lastAddress ?? null,
    killSwitch: row.killSwitch,
  };
}
