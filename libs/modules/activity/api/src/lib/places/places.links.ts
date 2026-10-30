import {Injectable, OnModuleInit} from '@nestjs/common';
import {LifeService, LinksService} from '@pd/api-core';
import {ActivityPeriod, DailyMetric, LifeEvent} from '@pd/contracts';
import {PlaceDayNumbers} from './day-numbers';
import {MIN_DAY_POINTS, PlacesService} from './places.service';

const HOUR = 3600;
const hours = (seconds: number) => Math.round((seconds / HOUR) * 10) / 10;

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
          day => day.points >= MIN_DAY_POINTS,
        );
        const numbers = await this.numbers(userId, period);
        if (!days.length) {
          return numbers;
        }
        return [
          ...numbers,
          {
            key: 'activity.places.km',
            module: 'activity',
            labelKey: 'activity.links.km',
            unit: 'count',
            missing: 'absent',
            days: days.map(day => ({
              day: day.day,
              value: Math.round(day.meters / 100) / 10,
            })),
          },
          {
            key: 'activity.places.count',
            module: 'activity',
            labelKey: 'activity.links.places',
            unit: 'count',
            missing: 'absent',
            days: days.map(day => ({
              day: day.day,
              value: day.entries.filter(entry => entry.kind === 'stay').length,
            })),
          },
        ];
      },
    });
    this.life.register({
      module: 'activity',
      day: async (userId, day): Promise<LifeEvent[]> => {
        const [today] = await this.places.days(userId, {from: day, to: day});
        const stays = today.entries.filter(
          entry => entry.kind === 'stay',
        ).length;
        if (today.points < MIN_DAY_POINTS || !stays) {
          return [];
        }
        return [
          {
            module: 'activity',
            icon: 'place',
            key: 'activity.life.places',
            params: {places: stays, km: Math.round(today.meters / 100) / 10},
            at: null,
            link: `/activity/places?day=${day}`,
          },
        ];
      },
    });
  }

  /** On foot, on the way, at home, new places: each only on the days the phone told enough. */
  private async numbers(
    userId: string,
    period: ActivityPeriod,
  ): Promise<DailyMetric[]> {
    const days = await this.places.dayNumbers(userId, period);
    const metric = (
      key: string,
      unit: DailyMetric['unit'],
      value: (day: PlaceDayNumbers) => number | null,
    ): DailyMetric => ({
      key: `activity.places.${key}`,
      module: 'activity',
      labelKey: `activity.links.${key}`,
      unit,
      missing: 'absent',
      days: days.flatMap(day => {
        const number = value(day);
        return number === null ? [] : [{day: day.day, value: number}];
      }),
    });
    return [
      metric('walk', 'hours', day => hours(day.walkSeconds)),
      metric('onTheWay', 'hours', day => hours(day.tripSeconds)),
      metric('home', 'hours', day =>
        day.homeSeconds === null ? null : hours(day.homeSeconds),
      ),
      metric('newPlaces', 'count', day => day.newPlaces),
    ].filter(one => one.days.length);
  }
}
