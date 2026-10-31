import {Injectable, OnModuleInit} from '@nestjs/common';
import {LifeService} from '@pd/api-core';
import {LifeEvent, LocalDate, WearableDay} from '@pd/contracts';
import {WearableService} from './wearable.service';

const LINK = '/health/band';

/**
 * The band in the Life feed: the steps of the day and the night's sleep that ended in it (the
 * Google Health API's numbers first, the phone's Health Connect filling the gaps — as on the
 * Band tab).
 */
@Injectable()
export class BandLife implements OnModuleInit {
  constructor(
    private readonly life: LifeService,
    private readonly wearable: WearableService,
  ) {}

  onModuleInit(): void {
    this.life.register({
      module: 'health',
      day: async (userId, day: LocalDate) => {
        const [found] = await this.wearable.days(userId, {from: day, to: day});
        return found ? bandLifeEvents(found) : [];
      },
    });
  }
}

/** What a day of the band shows in Life; a number the band did not tell shows nothing. */
export function bandLifeEvents(day: WearableDay): LifeEvent[] {
  const events: LifeEvent[] = [];
  if (day.steps) {
    events.push(
      event('directions_walk', 'health.life.steps', {steps: day.steps}),
    );
  }
  if (day.sleepMinutes) {
    const params: Record<string, string | number> = {
      hours: Math.floor(day.sleepMinutes / 60),
      minutes: day.sleepMinutes % 60,
      from: day.sleepStart ?? '',
      to: day.sleepEnd ?? '',
      score: day.sleepScore ?? 0,
    };
    const times = day.sleepStart && day.sleepEnd;
    const key =
      day.sleepScore !== null
        ? times
          ? 'health.life.sleepScored'
          : 'health.life.sleepScoredNoTimes'
        : times
          ? 'health.life.sleep'
          : 'health.life.sleepNoTimes';
    events.push(event('bedtime', key, params));
  }
  return events;
}

function event(
  icon: string,
  key: string,
  params: Record<string, string | number>,
): LifeEvent {
  return {module: 'health', icon, key, params, at: null, link: LINK};
}
