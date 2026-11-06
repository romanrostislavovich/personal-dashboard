import {Injectable, OnModuleInit} from '@nestjs/common';
import {forEachUser, LinksService, SchedulerService} from '@pd/api-core';
import {DailyMetric} from '@pd/contracts';
import {IndicesService} from './indices.service';

/** How each kept index goes to Links (see dayIndices): its unit, and what it is made of. */
const INDICES: Record<
  string,
  Pick<DailyMetric, 'unit'> &
    Partial<Pick<DailyMetric, 'partOf' | 'parts' | 'outcome'>>
> = {
  'phone.restlessness': {unit: 'score', parts: ['activity.phone.unlocks']},
  'phone.appSwitches': {unit: 'score'},
  'phone.shortSessions': {unit: 'percent'},
  'phone.bedtimeSpread': {unit: 'score', parts: ['activity.phone.lastUse']},
  'computer.restlessness': {unit: 'score'},
  deepWork: {unit: 'hours', outcome: true},
  deepWorkLongest: {unit: 'count', parts: ['activity.index.deepWork']},
  draining: {unit: 'hours'},
  nourishing: {unit: 'hours'},
  focusInterruptions: {unit: 'score'},
  lateNight: {
    unit: 'hours',
    parts: ['activity.phone.night', 'activity.lateGames'],
  },
  afterBedtime: {unit: 'count', parts: ['activity.index.lateNight']},
  firstWork: {unit: 'count'},
  morningDraining: {unit: 'count', partOf: 'activity.index.draining'},
  offline: {unit: 'hours'},
};

/**
 * Links v2's indices of the days to Links, and the job that counts them: every hour today and
 * yesterday, and a part of the history until all of it is counted (see IndicesService).
 */
@Injectable()
export class IndicesLinks implements OnModuleInit {
  constructor(
    private readonly links: LinksService,
    private readonly scheduler: SchedulerService,
    private readonly indices: IndicesService,
  ) {}

  onModuleInit(): void {
    this.links.registerDailyMetrics({
      module: 'activity',
      metrics: async (userId, period) => {
        const kept = await this.indices.read(userId, period);
        return Object.entries(INDICES).flatMap(
          ([key, shape]): DailyMetric[] => {
            const days = kept.get(key);
            return days?.length
              ? [
                  {
                    key: `activity.index.${key}`,
                    module: 'activity',
                    labelKey: `activity.links.index.${key}`,
                    // A day nothing was counted on is unknown, never a zero.
                    missing: 'absent',
                    ...shape,
                    days,
                  },
                ]
              : [];
          },
        );
      },
    });
    this.scheduler.register({
      name: 'activity.day-indices',
      cron: '20 * * * *',
      handler: async () =>
        forEachUser(
          'activity.day-indices',
          await this.indices.activeUserIds(),
          userId => this.indices.refresh(userId),
        ),
    });
  }
}
