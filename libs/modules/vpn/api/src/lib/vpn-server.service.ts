import {Inject, Injectable, Logger} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {
  AppConfig,
  Database,
  DB,
  NotificationsService,
  UsersService,
} from '@pd/api-core';
import {and, asc, count, eq, lt, sql} from 'drizzle-orm';
import {readFile, rename, stat, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {
  counterDelta,
  endpointAddress,
  generateKeyPair,
  generateObfuscation,
  networkOf,
  ONLINE_HANDSHAKE_SECONDS,
  parseStatus,
  PeerStatus,
  serverConfig,
} from './awg-config';
import {vpnMessages} from './vpn.messages';
import {vpnDays, vpnDevices, vpnNetworks, vpnServers} from './vpn.schema';
import {STATUS_STALE_MS, VpnService} from './vpn.service';

/** What the container reads (`awg setconf`) and what it writes, in VPN_DIR. */
const PEERS_FILE = 'awg0.conf';
const STATUS_FILE = 'status.tsv';
const NETWORK_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

type ServerRow = typeof vpnServers.$inferSelect;
type DeviceRow = typeof vpnDevices.$inferSelect;
type Owner = {id: string; locale: string};

/**
 * The server's side of the VPN, run every minute by VpnJobs where VPN_DIR is set: the owner's
 * keys made once, the devices written for the container (a device added or deleted takes effect
 * within a minute, from this server or from a sync client) and its status read back — the
 * traffic of the day, the first connection of a device, a new network, the VPN down or up.
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

  async tick(): Promise<void> {
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
    await this.readStatus(dir, server, devices, owner);
  }

  /** Networks not seen for 90 days are forgotten. */
  async forgetOldNetworks(): Promise<void> {
    await this.db
      .delete(vpnNetworks)
      .where(
        lt(
          vpnNetworks.lastSeenAt,
          new Date(Date.now() - NETWORK_DAYS * DAY_MS),
        ),
      );
  }

  /** The owner's server keys, made on the first run; the host and port follow the settings. */
  private async ensureServer(userId: string): Promise<ServerRow> {
    const host =
      this.config.get('VPN_HOST', {infer: true}) ??
      `vpn.${new URL(this.config.get('PUBLIC_URL', {infer: true})).hostname}`;
    const port = this.config.get('VPN_PORT', {infer: true});
    const existing = await this.vpn.server(userId);
    if (existing) {
      if (existing.host === host && existing.port === port) {
        return existing;
      }
      const [moved] = await this.db
        .update(vpnServers)
        .set({host, port})
        .where(eq(vpnServers.id, existing.id))
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
        port: server.port,
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
    server: ServerRow,
    devices: DeviceRow[],
    owner: Owner,
  ): Promise<void> {
    const path = join(dir, STATUS_FILE);
    const written = await stat(path).catch(() => null);
    const fresh =
      written !== null && Date.now() - written.mtimeMs < STATUS_STALE_MS;
    const text = vpnMessages(owner.locale);
    if (!fresh) {
      // Told once, and only after it was seen running: a VPN never started is not "down".
      if (server.state === 'up') {
        // The file's own time: the page counts "down" from it, not from the last fresh look.
        await this.setState(server, 'down', written?.mtime ?? null);
        await this.notify(owner, text.downTitle, text.downBody);
      }
      return;
    }
    if (server.state === 'down') {
      await this.notify(owner, text.upTitle, text.upBody);
    }
    await this.setState(server, 'up', written.mtime);
    const peers = parseStatus(await readFile(path, 'utf8'));
    const byKey = new Map(peers.map(peer => [peer.publicKey, peer]));
    const today = await this.vpn.today(owner.id);
    for (const device of devices) {
      const peer = byKey.get(device.publicKey);
      if (peer) {
        await this.takeIn(device, peer, today, owner);
      }
    }
  }

  private async setState(
    server: ServerRow,
    state: 'up' | 'down',
    statusAt: Date | null,
  ): Promise<void> {
    await this.db
      .update(vpnServers)
      .set(statusAt ? {state, statusAt} : {state})
      .where(eq(vpnServers.id, server.id));
  }

  /** One device's minute: its bytes and online minute into the day, and what is new about it. */
  private async takeIn(
    device: DeviceRow,
    peer: PeerStatus,
    today: string,
    owner: Owner,
  ): Promise<void> {
    const rx = counterDelta(peer.rx, device.seenRx);
    const tx = counterDelta(peer.tx, device.seenTx);
    const handshakeAt = peer.latestHandshake
      ? new Date(peer.latestHandshake * 1000)
      : null;
    const online =
      handshakeAt !== null &&
      Date.now() - handshakeAt.getTime() < ONLINE_HANDSHAKE_SECONDS * 1000;
    const address = peer.endpoint ? endpointAddress(peer.endpoint) : null;
    if (rx || tx || online) {
      await this.db
        .insert(vpnDays)
        .values({
          userId: owner.id,
          deviceId: device.id,
          day: today,
          rxBytes: rx,
          txBytes: tx,
          onlineMinutes: online ? 1 : 0,
        })
        .onConflictDoUpdate({
          target: [vpnDays.deviceId, vpnDays.day],
          set: {
            rxBytes: sql`${vpnDays.rxBytes} + ${rx}`,
            txBytes: sql`${vpnDays.txBytes} + ${tx}`,
            onlineMinutes: sql`${vpnDays.onlineMinutes} + ${online ? 1 : 0}`,
          },
        });
    }
    const first = !device.firstConnectedAt && handshakeAt !== null;
    await this.db
      .update(vpnDevices)
      .set({
        seenRx: peer.rx,
        seenTx: peer.tx,
        lastHandshakeAt: handshakeAt ?? device.lastHandshakeAt,
        lastAddress: address ?? device.lastAddress,
        ...(first ? {firstConnectedAt: handshakeAt} : {}),
      })
      .where(eq(vpnDevices.id, device.id));
    const text = vpnMessages(owner.locale);
    if (first) {
      await this.notify(
        owner,
        text.firstTitle(device.name),
        text.firstBody(address ?? '?'),
      );
    }
    if (address && online) {
      await this.seeNetwork(device, address, owner);
    }
  }

  private async seeNetwork(
    device: DeviceRow,
    address: string,
    owner: Owner,
  ): Promise<void> {
    const network = networkOf(address);
    const [known] = await this.db
      .select({total: count()})
      .from(vpnNetworks)
      .where(eq(vpnNetworks.deviceId, device.id));
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
            eq(vpnNetworks.deviceId, device.id),
            eq(vpnNetworks.network, network),
          ),
        );
      return;
    }
    // The first network of a device is where it was set up, not news.
    if (known.total > 0) {
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
