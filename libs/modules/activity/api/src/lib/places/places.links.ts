import { Injectable, OnModuleInit } from '@nestjs/common';
import { LifeService, LinksService } from '@pd/api-core';
import { DailyMetric, LifeEvent } from '@pd/contracts';
import { PlacesService } from './places.service';

/** A day the phone told less than this about is not counted: the numbers would be guesses. */
const MIN_POINTS = 8;

/**
 * Places for the other sections: the kilometres on the move and the places of a day to Links
 * (only the days the phone told enough about — no fixes is not "stayed at home"), and a line in
 * the life timeline.
 */
@Injectable()
export class PlacesLinks implements OnModuleInit {
  constructor(
    private readonly links: LinksService,
    private readonly life: LifeService,
    private readonly places: PlacesService,
  ) {}

  onModuleInit(): void {
    this.links.registerDailyMetrics({
      module: 'activity',
      metrics: async (userId, period): Promise<DailyMetric[]> => {
        const days = (await this.places.days(userId, period)).filter(
          (day) => day.points >= MIN_POINTS,
        );
        if (!days.length) {
          return [];
        }
        return [
          {
            key: 'activity.places.km',
            module: 'activity',
            labelKey: 'activity.links.km',
            unit: 'count',
            missing: 'absent',
            days: days.map((day) => ({ day: day.day, value: Math.round(day.meters / 100) / 10 })),
          },
          {
            key: 'activity.places.count',
            module: 'activity',
            labelKey: 'activity.links.places',
            unit: 'count',
            missing: 'absent',
            days: days.map((day) => ({
              day: day.day,
              value: day.entries.filter((entry) => entry.kind === 'stay').length,
            })),
          },
        ];
      },
    });
    this.life.register({
      module: 'activity',
      day: async (userId, day): Promise<LifeEvent[]> => {
        const [today] = await this.places.days(userId, { from: day, to: day });
        const stays = today.entries.filter((entry) => entry.kind === 'stay').length;
        if (today.points < MIN_POINTS || !stays) {
          return [];
        }
        return [
          {
            module: 'activity',
            icon: 'place',
            key: 'activity.life.places',
            params: { places: stays, km: Math.round(today.meters / 100) / 10 },
            at: null,
            link: `/activity/places?day=${day}`,
          },
        ];
      },
    });
  }
}
