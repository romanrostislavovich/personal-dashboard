import {Inject, Injectable, Logger} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {
  AppConfig,
  Database,
  DB,
  NotificationsService,
  UsersService,
} from '@pd/api-core';
import {and, asc, eq, gt, lt, or, sql} from 'drizzle-orm';
import {readFile, rename, stat, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {
  generateKeyPair,
  generateObfuscation,
  networkOf,
  parseStatus,
  PeerStatus,
  serverConfig,
} from './awg-config';
import {deviceMinute} from './device-minute';
import {vpnMessages} from './vpn.messages';
import {
  vpnDays,
  vpnDevices,
  vpnDeviceState,
  vpnNetworks,
  vpnServers,
  vpnServerState,
} from './vpn.schema';
import {STATUS_STALE_MS, VpnService} from './vpn.service';

/** What the container reads (`awg setconf`) and what it writes, in VPN_DIR. */
const PEERS_FILE = 'awg0.conf';
const STATUS_FILE = 'status.tsv';
const NETWORK_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
/** The minutes' bytes go into the synced `vpn_days` this often (see vpnDays). */
export const FLUSH_MINUTES = 15;

type ServerRow = typeof vpnServers.$inferSelect;
type DeviceRow = typeof vpnDevices.$inferSelect;
type StateRow = typeof vpnDeviceState.$inferSelect;
type Owner = {id: string; locale: string};

/**
 * The server's side of the VPN, run every minute by VpnJobs where VPN_DIR is set: the owner's
 * keys made once, the devices written for the container (a device added or deleted takes effect
 * within a minute) and its status read back into the unsynced `vpn` schema — who is online, the
 * bytes and minutes (into the day every 15 minutes), the first connection of a device, a new
 * network, the VPN down or up.
 */
@Injectable()
export class VpnServerService {
  private readonly logger = new Logger(VpnServerService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly vpn: VpnService,
  ) {}

  get dir(): string | undefined {
    return this.config.get('VPN_DIR', {infer: true});
  }

  /** `now` is for tests: the flush happens on whole quarters of an hour. */
  async tick(now = new Date()): Promise<void> {
    const dir = this.dir;
    const user = dir ? await this.users.owner() : undefined;
    if (!dir || !user) {
      return;
    }
    const owner = {id: user.id, locale: user.locale};
    const server = await this.ensureServer(owner.id);
    const devices = await this.db
      .select()
      .from(vpnDevices)
      .where(eq(vpnDevices.userId, owner.id))
      .orderBy(asc(vpnDevices.address));
    await this.writePeers(dir, server, devices);
    await this.readStatus(dir, devices, owner);
    if (now.getMinutes() % FLUSH_MINUTES === 0) {
      await this.flush(owner.id);
    }
  }

  /** The pending bytes and minutes of every device into their days. */
  async flush(userId: string, only?: StateRow): Promise<void> {
    const states = only
      ? [only]
      : await this.db
          .select()
          .from(vpnDeviceState)
          .where(
            and(
              eq(vpnDeviceState.userId, userId),
              or(
                gt(vpnDeviceState.pendingRx, 0),
                gt(vpnDeviceState.pendingTx, 0),
                gt(vpnDeviceState.pendingMinutes, 0),
              ),
            ),
          );
    for (const state of states) {
      if (!state.pendingDay) {
        continue;
      }
      if (state.pendingRx || state.pendingTx || state.pendingMinutes) {
        await this.db
          .insert(vpnDays)
          .values({
            userId,
            deviceId: state.deviceId,
            day: state.pendingDay,
            rxBytes: state.pendingRx,
            txBytes: state.pendingTx,
            onlineMinutes: state.pendingMinutes,
          })
          .onConflictDoUpdate({
            target: [vpnDays.deviceId, vpnDays.day],
            set: {
              rxBytes: sql`${vpnDays.rxBytes} + ${state.pendingRx}`,
              txBytes: sql`${vpnDays.txBytes} + ${state.pendingTx}`,
              onlineMinutes: sql`${vpnDays.onlineMinutes} + ${state.pendingMinutes}`,
            },
          });
      }
      await this.db
        .update(vpnDeviceState)
        .set({pendingRx: 0, pendingTx: 0, pendingMinutes: 0})
        .where(
          and(
            eq(vpnDeviceState.deviceId, state.deviceId),
            eq(vpnDeviceState.userId, userId),
          ),
        );
    }
  }

  /** Networks not seen for 90 days are forgotten. */
  async forgetOldNetworks(): Promise<void> {
    const owner = await this.users.owner();
    if (!owner) {
      return;
    }
    await this.db
      .delete(vpnNetworks)
      .where(
        and(
          eq(vpnNetworks.userId, owner.id),
          lt(
            vpnNetworks.lastSeenAt,
            new Date(Date.now() - NETWORK_DAYS * DAY_MS),
          ),
        ),
      );
  }

  /**
   * The owner's server keys, made on the first run; the host and port follow the settings. The
   * row is synced, so it is written only when something in it changes.
   */
  private async ensureServer(userId: string): Promise<ServerRow> {
    const host =
      this.config.get('VPN_HOST', {infer: true}) ??
      `vpn.${new URL(this.config.get('PUBLIC_URL', {infer: true})).hostname}`;
    // Where devices knock; the container itself always listens on VPN_PORT.
    const port =
      this.config.get('VPN_PUBLIC_PORT', {infer: true}) ??
      this.config.get('VPN_PORT', {infer: true});
    const existing = await this.vpn.server(userId);
    if (existing) {
      if (existing.host === host && existing.port === port) {
        return existing;
      }
      const [moved] = await this.db
        .update(vpnServers)
        .set({host, port})
        .where(
          and(eq(vpnServers.id, existing.id), eq(vpnServers.userId, userId)),
        )
        .returning();
      return moved;
    }
    const keys = generateKeyPair();
    const [created] = await this.db
      .insert(vpnServers)
      .values({
        userId,
        privateKey: keys.privateKey,
        publicKey: keys.publicKey,
        host,
        port,
        obfuscation: generateObfuscation(),
      })
      .returning();
    this.logger.log(
      `The VPN server's keys are made; devices connect to ${host}:${port}`,
    );
    return created;
  }

  /** Written only when it changed, and whole at once: the container may read it any moment. */
  private async writePeers(
    dir: string,
    server: ServerRow,
    devices: DeviceRow[],
  ): Promise<void> {
    const text = serverConfig(
      {
        privateKey: server.privateKey,
        port: this.config.get('VPN_PORT', {infer: true}),
        obfuscation: server.obfuscation,
      },
      devices.map(device => ({
        publicKey: device.publicKey,
        presharedKey: device.presharedKey,
        address: device.address,
      })),
    );
    const path = join(dir, PEERS_FILE);
    const current = await readFile(path, 'utf8').catch(() => null);
    if (current === text) {
      return;
    }
    await writeFile(`${path}.new`, text, {mode: 0o600});
    await rename(`${path}.new`, path);
  }

  private async readStatus(
    dir: string,
    devices: DeviceRow[],
    owner: Owner,
  ): Promise<void> {
    const path = join(dir, STATUS_FILE);
    const written = await stat(path).catch(() => null);
    const fresh =
      written !== null && Date.now() - written.mtimeMs < STATUS_STALE_MS;
    const [known] = await this.db
      .select()
      .from(vpnServerState)
      .where(eq(vpnServerState.userId, owner.id));
    const text = vpnMessages(owner.locale);
    if (!fresh) {
      // Told once, and only after it was seen running: a VPN never started is not "down".
      if (known?.state === 'up') {
        // The file's own time: the page counts "down" from it, not from the last fresh look.
        await this.setState(owner.id, 'down', written?.mtime ?? null);
        await this.notify(owner, text.downTitle, text.downBody);
      }
      return;
    }
    // Saved before telling: a failed save must not tell it again next minute.
    await this.setState(owner.id, 'up', written.mtime);
    if (known?.state === 'down') {
      await this.notify(owner, text.upTitle, text.upBody);
    }
    const peers = parseStatus(await readFile(path, 'utf8'));
    const byKey = new Map(peers.map(peer => [peer.publicKey, peer]));
    const today = await this.vpn.today(owner.id);
    for (const device of devices) {
      const peer = byKey.get(device.publicKey);
      if (!peer) {
        continue;
      }
      try {
        await this.takeIn(device, peer, today, owner);
      } catch (error) {
        // A device deleted a moment ago: the others still count.
        this.logger.warn(`VPN status of ${device.id} not taken: ${error}`);
      }
    }
  }

  private async setState(
    userId: string,
    state: 'up' | 'down',
    statusAt: Date | null,
  ): Promise<void> {
    const values = statusAt ? {state, statusAt} : {state};
    await this.db
      .insert(vpnServerState)
      .values({userId, ...values})
      .onConflictDoUpdate({target: vpnServerState.userId, set: values});
  }

  /** One device's minute: its bytes and online minute pending for the day, and what is new. */
  private async takeIn(
    device: DeviceRow,
    peer: PeerStatus,
    today: string,
    owner: Owner,
  ): Promise<void> {
    const [state] = await this.db
      .select()
      .from(vpnDeviceState)
      .where(
        and(
          eq(vpnDeviceState.deviceId, device.id),
          eq(vpnDeviceState.userId, owner.id),
        ),
      );
    if (state?.pendingDay && state.pendingDay !== today) {
      // A new day: yesterday's last minutes go to yesterday.
      await this.flush(owner.id, state);
    }
    const {next, online, address, first} = deviceMinute(
      state,
      peer,
      today,
      new Date(),
    );
    await this.db
      .insert(vpnDeviceState)
      .values({deviceId: device.id, userId: owner.id, ...next})
      .onConflictDoUpdate({target: vpnDeviceState.deviceId, set: next});
    const text = vpnMessages(owner.locale);
    if (first) {
      await this.notify(
        owner,
        text.firstTitle(device.name),
        text.firstBody(address ?? '?'),
      );
    }
    if (address && online) {
      // The network of the first connection is where it was set up, not news.
      await this.seeNetwork(device, address, owner, !first);
    }
  }

  private async seeNetwork(
    device: DeviceRow,
    address: string,
    owner: Owner,
    tell: boolean,
  ): Promise<void> {
    const network = networkOf(address);
    const [inserted] = await this.db
      .insert(vpnNetworks)
      .values({userId: owner.id, deviceId: device.id, network, address})
      .onConflictDoNothing()
      .returning({id: vpnNetworks.id});
    if (!inserted) {
      await this.db
        .update(vpnNetworks)
        .set({address, lastSeenAt: new Date()})
        .where(
          and(
            eq(vpnNetworks.userId, owner.id),
            eq(vpnNetworks.deviceId, device.id),
            eq(vpnNetworks.network, network),
          ),
        );
      return;
    }
    if (tell) {
      const text = vpnMessages(owner.locale);
      await this.notify(
        owner,
        text.networkTitle(device.name),
        text.networkBody(network, address),
      );
    }
  }

  private notify(owner: Owner, title: string, body: string): Promise<void> {
    return this.notifications.send(owner.id, {
      title,
      body,
      source: 'vpn',
      link: '/vpn',
    });
  }
}
