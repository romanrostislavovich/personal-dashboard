import { Injectable, OnModuleInit } from '@nestjs/common';
import { LinksService } from '@pd/api-core';
import { ActivityPeriod, DailyMetric, PhoneSignalsDay } from '@pd/contracts';
import { PhoneSignalsService } from './phone-signals.service';
import { PhoneUsageService } from './phone-usage.service';
import { hoursOf } from './signals-day';

const HOUR = 3600;

/**
 * The phone's unlocks and its night to Links: next to mood and sleep they say the most of the
 * phone. Only the days the phone told something — no unlocks is not "did not pick it up".
 */
@Injectable()
export class PhoneUsageLinks implements OnModuleInit {
  constructor(
    private readonly links: LinksService,
    private readonly phone: PhoneUsageService,
    private readonly signals: PhoneSignalsService,
  ) {}

  onModuleInit(): void {
    this.links.registerDailyMetrics({
      module: 'activity',
      metrics: async (userId, period): Promise<DailyMetric[]> => {
        const { days } = await this.phone.usage(userId, period);
        const told = days.filter((day) => day.unlocks > 0);
        const signals = await this.signalMetrics(userId, period);
        if (!told.length) {
          return signals;
        }
        return [
          ...signals,
          {
            key: 'activity.phone.unlocks',
            module: 'activity',
            labelKey: 'activity.links.unlocks',
            unit: 'count',
            missing: 'absent',
            days: told.map((day) => ({ day: day.day, value: day.unlocks })),
          },
          {
            key: 'activity.phone.night',
            module: 'activity',
            labelKey: 'activity.links.phoneNight',
            unit: 'hours',
            missing: 'absent',
            days: told.map((day) => ({
              day: day.day,
              value: Math.round((day.nightSeconds / HOUR) * 10) / 10,
            })),
          },
        ];
      },
    });
  }

  /**
   * The numbers of the phone's signals (docs/telemetry.md): each only on the days the phone told
   * it — a day it did not is unknown, never a zero.
   */
  private async signalMetrics(userId: string, period: ActivityPeriod): Promise<DailyMetric[]> {
    const days = await this.signals.days(userId, period);
    const metric = (
      key: string,
      unit: DailyMetric['unit'],
      value: (day: PhoneSignalsDay) => number | null,
    ): DailyMetric => ({
      key: `activity.phone.${key}`,
      module: 'activity',
      labelKey: `activity.links.phone.${key}`,
      unit,
      missing: 'absent',
      days: days.flatMap((day) => {
        const number = value(day);
        return number === null ? [] : [{ day: day.day, value: number }];
      }),
    });
    return [
      metric('firstUse', 'clock', (day) => hoursOf(day.firstUse)),
      metric('lastUse', 'clock', (day) => hoursOf(day.lastUse)),
      metric('rest', 'hours', (day) => day.restHours),
      metric('steps', 'count', (day) => day.steps),
      metric('headphones', 'hours', (day) => day.headphonesHours),
      metric('car', 'hours', (day) => day.carHours),
      metric('media', 'hours', (day) => day.mediaHours),
      metric('dnd', 'hours', (day) => day.dndHours),
      metric('calls', 'count', (day) => day.calls),
      metric('callMinutes', 'count', (day) => day.callMinutes),
      metric('people', 'count', (day) => day.people),
      metric('photos', 'count', (day) => day.photos),
      metric('mobileData', 'count', (day) => day.mobileMegabytes),
      metric('noise', 'score', (day) => day.noiseDb),
      metric('daylight', 'hours', (day) => day.daylightHours),
    ].filter((one) => one.days.length);
  }
}
