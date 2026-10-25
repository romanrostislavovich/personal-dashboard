import { Injectable, OnModuleInit } from '@nestjs/common';
import { LinksService } from '@pd/api-core';
import { DailyMetric } from '@pd/contracts';
import { PhoneUsageService } from './phone-usage.service';

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
  ) {}

  onModuleInit(): void {
    this.links.registerDailyMetrics({
      module: 'activity',
      metrics: async (userId, period): Promise<DailyMetric[]> => {
        const { days } = await this.phone.usage(userId, period);
        const told = days.filter((day) => day.unlocks > 0);
        if (!told.length) {
          return [];
        }
        return [
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
}
