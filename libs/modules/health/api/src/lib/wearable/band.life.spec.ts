import {WearableDay} from '@pd/contracts';
import {bandLifeEvents} from './band.life';

const EMPTY = Object.fromEntries(
  [
    'steps',
    'calories',
    'distanceKm',
    'activeZoneMinutes',
    'heartRateAvg',
    'heartRateMax',
    'restingHeartRate',
    'hrvMs',
    'spo2',
    'sleepMinutes',
    'deepMinutes',
    'remMinutes',
    'lightMinutes',
    'awakeMinutes',
    'sleepStart',
    'sleepEnd',
    'sleepScore',
    'stressScore',
    'resilience',
    'reactions',
    'mindfulnessMinutes',
    'skinTempDelta',
  ].map(key => [key, null]),
) as unknown as Omit<WearableDay, 'day'>;

const day = (values: Partial<WearableDay>): WearableDay => ({
  ...EMPTY,
  day: '2026-10-30',
  ...values,
});

describe('the band in Life', () => {
  it('shows the steps and the night with its score', () => {
    const events = bandLifeEvents(
      day({
        steps: 8432,
        sleepMinutes: 440,
        sleepStart: '00:40',
        sleepEnd: '08:00',
        sleepScore: 82,
      }),
    );
    expect(events.map(e => e.key)).toEqual([
      'health.life.steps',
      'health.life.sleepScored',
    ]);
    expect(events[0].params).toEqual({steps: 8432});
    expect(events[1].params).toMatchObject({hours: 7, minutes: 20, score: 82});
    expect(events.every(e => e.at === null && e.link === '/health/band')).toBe(
      true,
    );
  });

  it('leaves out what the band did not tell', () => {
    expect(bandLifeEvents(day({}))).toEqual([]);
    expect(bandLifeEvents(day({sleepMinutes: 400})).map(e => e.key)).toEqual([
      'health.life.sleepNoTimes',
    ]);
  });
});
