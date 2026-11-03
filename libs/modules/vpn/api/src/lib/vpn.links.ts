import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {DB, Database, LinksService} from '@pd/api-core';
import {DailyMetric, LocalDate} from '@pd/contracts';
import {and, between, eq, sql} from 'drizzle-orm';
import {vpnDays} from './vpn.schema';

const MB = 1024 * 1024;

/**
 * The VPN in Links: the hours a device was in it and the megabytes through it, every day. A day
 * with no row is a day without the VPN — zero, not unknown, once the VPN was set up.
 */
@Injectable()
export class VpnLinks implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
  ) {}

  onModuleInit(): void {
    this.links.registerDailyMetrics({
      module: 'vpn',
      metrics: (userId, period) => this.metrics(userId, period),
    });
    this.links.registerPages([
      {
        module: 'vpn',
        path: '/vpn',
        description: 'the VPN: devices, online now, traffic by day',
      },
    ]);
  }

  private async metrics(
    userId: string,
    period: {from: LocalDate; to: LocalDate},
  ): Promise<DailyMetric[]> {
    const rows = await this.db
      .select({
        day: vpnDays.day,
        minutes: sql<number>`max(${vpnDays.onlineMinutes})::int`,
        bytes: sql<number>`sum(${vpnDays.rxBytes} + ${vpnDays.txBytes})::float8`,
      })
      .from(vpnDays)
      .where(
        and(
          eq(vpnDays.userId, userId),
          between(vpnDays.day, period.from, period.to),
        ),
      )
      .groupBy(vpnDays.day);
    if (!rows.length) {
      return [];
    }
    return [
      {
        key: 'vpn.hours',
        module: 'vpn',
        labelKey: 'vpn.links.hours',
        unit: 'hours',
        days: rows.map(row => ({
          day: row.day,
          value: Math.round((row.minutes / 60) * 10) / 10,
        })),
      },
      {
        key: 'vpn.megabytes',
        module: 'vpn',
        labelKey: 'vpn.links.megabytes',
        unit: 'count',
        days: rows.map(row => ({
          day: row.day,
          value: Math.round(row.bytes / MB),
        })),
      },
    ];
  }
}
