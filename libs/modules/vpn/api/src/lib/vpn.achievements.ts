import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {achievementTier, AchievementsService, DB, Database} from '@pd/api-core';
import {count, eq, isNotNull, and, sql} from 'drizzle-orm';
import {vpnDays, vpnDeviceState} from './vpn.schema';

const GB = 1024 ** 3;

/** The VPN's achievements: devices in it, hours through it, gigabytes through it. */
@Injectable()
export class VpnAchievements implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
  ) {}

  onModuleInit(): void {
    this.achievements.register({
      id: 'vpn.devices',
      module: 'vpn',
      measure: userId => this.connectedDevices(userId),
      tiers: [
        achievementTier(
          1,
          '🔐',
          {en: 'My own tunnel', ru: 'Свой туннель'},
          {
            en: 'A device connected to your own VPN',
            ru: 'Устройство подключилось к твоему VPN',
          },
        ),
        achievementTier(
          3,
          '🕸️',
          {en: 'Everything covered', ru: 'Всё под защитой'},
          {
            en: 'Three devices connected to your VPN',
            ru: 'Три устройства подключались к твоему VPN',
          },
        ),
      ],
    });

    this.achievements.register({
      id: 'vpn.hours',
      module: 'vpn',
      measure: userId => this.hours(userId),
      tiers: [
        achievementTier(
          10,
          '🛡️',
          {en: 'Under cover', ru: 'Под прикрытием'},
          {en: '10 hours in the VPN', ru: '10 часов в VPN'},
        ),
        achievementTier(
          100,
          '🕶️',
          {en: 'Invisible', ru: 'Невидимка'},
          {en: '100 hours in the VPN', ru: '100 часов в VPN'},
        ),
        achievementTier(
          1000,
          '🛰️',
          {en: 'Off the radar', ru: 'Вне радаров'},
          {en: '1000 hours in the VPN', ru: '1000 часов в VPN'},
        ),
      ],
    });

    this.achievements.register({
      id: 'vpn.traffic',
      module: 'vpn',
      measure: userId => this.gigabytes(userId),
      tiers: [
        achievementTier(
          1,
          '📦',
          {en: 'The first gigabyte', ru: 'Первый гигабайт'},
          {
            en: '1 GB through your VPN',
            ru: '1 ГБ через твой VPN',
          },
        ),
        achievementTier(
          10,
          '🚚',
          {en: 'A full truck', ru: 'Полный грузовик'},
          {en: '10 GB through your VPN', ru: '10 ГБ через твой VPN'},
        ),
        achievementTier(
          100,
          '🚢',
          {en: 'A cargo ship', ru: 'Контейнеровоз'},
          {en: '100 GB through your VPN', ru: '100 ГБ через твой VPN'},
        ),
      ],
    });
  }

  private async connectedDevices(userId: string): Promise<number> {
    const [row] = await this.db
      .select({total: count()})
      .from(vpnDeviceState)
      .where(
        and(
          eq(vpnDeviceState.userId, userId),
          isNotNull(vpnDeviceState.firstConnectedAt),
        ),
      );
    return row?.total ?? 0;
  }

  /** Hours of the longest-connected device each day, summed (devices together are one hour). */
  private async hours(userId: string): Promise<number> {
    const {rows} = await this.db.execute<{minutes: number}>(sql`
      SELECT coalesce(sum(m), 0)::int AS minutes FROM (
        SELECT max(${vpnDays.onlineMinutes}) AS m FROM ${vpnDays}
        WHERE ${vpnDays.userId} = ${userId} GROUP BY ${vpnDays.day}
      ) d`);
    return Math.floor((rows[0]?.minutes ?? 0) / 60);
  }

  private async gigabytes(userId: string): Promise<number> {
    const [row] = await this.db
      .select({
        bytes: sql<number>`coalesce(sum(${vpnDays.rxBytes} + ${vpnDays.txBytes}), 0)::float8`,
      })
      .from(vpnDays)
      .where(eq(vpnDays.userId, userId));
    return Math.floor((row?.bytes ?? 0) / GB);
  }
}
