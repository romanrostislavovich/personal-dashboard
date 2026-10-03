import { Injectable, OnModuleInit } from '@nestjs/common';
import { LifeService } from '@pd/api-core';
import { LifeCard, LifeEvent } from '@pd/contracts';
import { ActivityService } from './activity.service';
import { WellbeingService } from './wellbeing.service';

const HOUR = 3600;

/** Time at the computer in the life timeline and in the summaries, with focus sessions. */
@Injectable()
export class ActivityLife implements OnModuleInit {
  constructor(
    private readonly life: LifeService,
    private readonly activity: ActivityService,
    private readonly wellbeing: WellbeingService,
  ) {}

  onModuleInit(): void {
    this.life.register({
      module: 'activity',
      day: async (userId, day): Promise<LifeEvent[]> => {
        const stats = await this.activity.stats(userId, { from: day, to: day });
        if (stats.totalSeconds < 10 * 60) {
          return [];
        }
        const focus = await this.wellbeing.focusStats(userId, { from: day, to: day });
        return [
          {
            module: 'activity',
            icon: 'timelapse',
            key: focus.completed ? 'activity.life.dayFocus' : 'activity.life.day',
            params: {
              hours: hours(stats.totalSeconds),
              app: stats.apps[0]?.name ?? '',
              focus: focus.completed,
            },
            at: null,
            link: '/activity',
          },
        ];
      },
      period: async (userId, period): Promise<LifeCard[]> => {
        const stats = await this.activity.stats(userId, period);
        if (!stats.totalSeconds) {
          return [];
        }
        const focus = await this.wellbeing.focusStats(userId, period);
        return [
          {
            module: 'activity',
            icon: 'timelapse',
            key: 'activity.life.total',
            value: stats.totalSeconds / HOUR,
            format: 'hours',
            ...(stats.apps[0]
              ? { detailKey: 'activity.life.topApp', detailParams: { app: stats.apps[0].name } }
              : {}),
          },
          ...(focus.completed
            ? [
                {
                  module: 'activity',
                  icon: 'timer',
                  key: 'activity.life.focus',
                  value: focus.focusSeconds / HOUR,
                  format: 'hours' as const,
                  detailKey: 'activity.life.focusSessions',
                  detailParams: { count: focus.completed },
                },
              ]
            : []),
        ];
      },
    });
  }
}

function hours(seconds: number): string {
  return (Math.round((seconds / HOUR) * 10) / 10).toString();
}
