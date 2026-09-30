import { Injectable, OnModuleInit } from '@nestjs/common';
import { MorningDigestService } from '@pd/api-core';
import { MonitorsService } from './monitors.service';

/** The digest warns about a certificate this many days before it expires. */
const SSL_WARNING_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Sites that went down or came back, and certificates about to expire, in the morning digest. */
@Injectable()
export class MonitoringDigest implements OnModuleInit {
  constructor(
    private readonly digest: MorningDigestService,
    private readonly monitors: MonitorsService,
  ) {}

  onModuleInit(): void {
    this.digest.register({
      id: 'monitoring.sites',
      module: 'monitoring',
      description:
        'Monitored sites: status (up/down), since when down and the error, the SSL expiry date ' +
        `when it is within ${SSL_WARNING_DAYS} days. Tell which sites went down or came back ` +
        'and which certificates expire soon.',
      // Response times and uptime percentages change with every check, so they are left out.
      collect: async (userId) =>
        (await this.monitors.list(userId)).map((monitor) => ({
          url: monitor.url,
          status: monitor.status,
          downSince: monitor.downSince,
          error: monitor.status === 'down' ? monitor.lastError : null,
          sslExpiresAt: expiresSoon(monitor.sslExpiresAt) ? monitor.sslExpiresAt : null,
        })),
    });
  }
}

function expiresSoon(at: string | null): boolean {
  return at !== null && new Date(at).getTime() - Date.now() < SSL_WARNING_DAYS * DAY_MS;
}
