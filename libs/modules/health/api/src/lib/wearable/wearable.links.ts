import { Injectable, OnModuleInit } from '@nestjs/common';
import { LinksService } from '@pd/api-core';
import { DailyMetric, WearableDay } from '@pd/contracts';
import { WearableService } from './wearable.service';

/** HH:MM as hours of the day (Links' `clock`); a bedtime after midnight goes over 24 (00:30 → 24.5). */
function clock(time: string | null, night: boolean): number | null {
  if (!time) {
    return null;
  }
  const [h, m] = time.split(':').map(Number);
  const value = h + m / 60;
  return Math.round((night && value < 12 ? value + 24 : value) * 100) / 100;
}

const hours = (minutes: number | null) =>
  minutes === null ? null : Math.round((minutes / 60) * 10) / 10;

/**
 * The band's days to Links (docs/telemetry.md): sleep, the heart, activity. Each number only on
 * the days the band told it — a day it was not worn is unknown, never a zero.
 */
@Injectable()
export class WearableLinks implements OnModuleInit {
  constructor(
    private readonly links: LinksService,
    private readonly wearable: WearableService,
  ) {}

  onModuleInit(): void {
    this.links.registerDailyMetrics({
      module: 'health',
      metrics: async (userId, period) => {
        const days = await this.wearable.days(userId, period);
        const metric = (
          key: string,
          unit: DailyMetric['unit'],
          value: (day: WearableDay) => number | null,
        ): DailyMetric => ({
          key: `health.band.${key}`,
          module: 'health',
          labelKey: `health.links.band.${key}`,
          unit,
          missing: 'absent',
          days: days.flatMap((day) => {
            const number = value(day);
            return number === null ? [] : [{ day: day.day, value: number }];
          }),
        });
        return [
          metric('sleep', 'hours', (day) => hours(day.sleepMinutes)),
          metric('deepSleep', 'hours', (day) => hours(day.deepMinutes)),
          metric('remSleep', 'hours', (day) => hours(day.remMinutes)),
          metric('bedtime', 'clock', (day) => clock(day.sleepStart, true)),
          metric('wake', 'clock', (day) => clock(day.sleepEnd, false)),
          metric('restingHeartRate', 'count', (day) => day.restingHeartRate),
          metric('hrv', 'score', (day) => day.hrvMs),
          metric('spo2', 'percent', (day) => day.spo2),
          metric('steps', 'count', (day) => day.steps),
          metric('calories', 'count', (day) => day.calories),
          metric('zoneMinutes', 'count', (day) => day.activeZoneMinutes),
          // Counted by the dashboard from the phone's Health Connect data (band-days.service.ts).
          metric('sleepScore', 'score', (day) => day.sleepScore),
          metric('stress', 'score', (day) => day.stressScore),
          metric('resilience', 'score', (day) => day.resilience),
          metric('reactions', 'count', (day) => day.reactions),
          metric('mindfulness', 'count', (day) => day.mindfulnessMinutes),
          metric('skinTemp', 'degrees', (day) => day.skinTempDelta),
        ].filter((one) => one.days.length);
      },
    });
  }
}
