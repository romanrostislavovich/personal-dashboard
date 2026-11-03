import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {
  DB,
  Database,
  FoundProblem,
  Inspection,
  SecurityService,
} from '@pd/api-core';
import {asc, eq} from 'drizzle-orm';
import {vpnMessages} from './vpn.messages';
import {vpnDevices, vpnNetworks, vpnServers} from './vpn.schema';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** A new network is a finding for a day; the notification told about it already. */
const NEW_NETWORK_HOURS = 24;
const IDLE_DAYS = 60;
/** The container silent this long with devices set up: the VPN is down. */
const DOWN_MINUTES = 10;

/** What the security agent sees of the VPN: no keys, only who connects from where. */
export interface VpnFacts {
  host: string;
  port: number;
  statusAt: string | null;
  devices: {
    name: string;
    kind: string;
    createdAt: string;
    firstConnectedAt: string | null;
    lastHandshakeAt: string | null;
    networks: {network: string; address: string; firstSeenAt: string}[];
  }[];
}

/** The rules: a network new in the last day, the VPN silent, a device unused for long. */
export function vpnProblems(
  facts: VpnFacts,
  text: ReturnType<typeof vpnMessages>['finding'],
  now: Date,
): FoundProblem[] {
  const problems: FoundProblem[] = [];
  const silentMinutes = facts.statusAt
    ? Math.floor((now.getTime() - Date.parse(facts.statusAt)) / 60_000)
    : null;
  if (
    facts.devices.length &&
    silentMinutes !== null &&
    silentMinutes >= DOWN_MINUTES
  ) {
    problems.push({
      key: 'vpn.down',
      severity: 'medium',
      title: text.downTitle,
      details: text.downDetails(silentMinutes),
      fix: text.downFix,
    });
  }
  for (const device of facts.devices) {
    const first = device.firstConnectedAt
      ? Date.parse(device.firstConnectedAt)
      : null;
    for (const network of device.networks) {
      const seen = Date.parse(network.firstSeenAt);
      // The network it was set up from is not new.
      if (
        first !== null &&
        seen > first + 5 * 60_000 &&
        now.getTime() - seen < NEW_NETWORK_HOURS * HOUR_MS
      ) {
        problems.push({
          key: `vpn.${device.name}.network.${network.network}`,
          severity: 'medium',
          title: text.newNetworkTitle(device.name),
          details: text.newNetworkDetails(network.network, network.address),
          fix: text.newNetworkFix,
        });
      }
    }
    const last = Date.parse(device.lastHandshakeAt ?? device.createdAt);
    if (now.getTime() - last > IDLE_DAYS * DAY_MS) {
      problems.push({
        key: `vpn.${device.name}.idle`,
        severity: 'low',
        title: text.idleTitle(device.name),
        details: text.idleDetails,
        fix: text.idleFix,
      });
    }
  }
  return problems;
}

/** The VPN as a source of the security agent (see SecuritySource). */
@Injectable()
export class VpnSecurity implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly security: SecurityService,
  ) {}

  onModuleInit(): void {
    this.security.registerSource({
      id: 'vpn',
      area: 'host',
      description:
        "The owner's VPN (AmneziaWG on the dashboard's server): its address and port, when " +
        'its container last answered, and every device allowed in — when it was added, first ' +
        'and last connected, and the networks (IPv4 /16, IPv6 /48) it came from in 90 days. ' +
        'A device from a network it never used may be a leaked key.',
      inspect: (userId, locale) => this.inspect(userId, locale),
    });
  }

  /** `null` — this dashboard has no VPN. */
  private async inspect(
    userId: string,
    locale: string,
  ): Promise<Inspection | null> {
    const [server] = await this.db
      .select()
      .from(vpnServers)
      .where(eq(vpnServers.userId, userId));
    if (!server) {
      return null;
    }
    const devices = await this.db
      .select()
      .from(vpnDevices)
      .where(eq(vpnDevices.userId, userId))
      .orderBy(asc(vpnDevices.createdAt));
    const networks = await this.db
      .select()
      .from(vpnNetworks)
      .where(eq(vpnNetworks.userId, userId));
    const facts: VpnFacts = {
      host: server.host,
      port: server.port,
      statusAt: server.statusAt?.toISOString() ?? null,
      devices: devices.map(device => ({
        name: device.name,
        kind: device.kind,
        createdAt: device.createdAt.toISOString(),
        firstConnectedAt: device.firstConnectedAt?.toISOString() ?? null,
        lastHandshakeAt: device.lastHandshakeAt?.toISOString() ?? null,
        networks: networks
          .filter(network => network.deviceId === device.id)
          .map(network => ({
            network: network.network,
            address: network.address,
            firstSeenAt: network.firstSeenAt.toISOString(),
          })),
      })),
    };
    return {
      facts,
      problems: vpnProblems(facts, vpnMessages(locale).finding, new Date()),
    };
  }
}
