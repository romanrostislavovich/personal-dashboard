import {dayHours, NOTIFICATION_PEAK} from './day-hours';
import {DayMoments, IndexSpan} from './day-indices';

const MIN = 60_000;
const H = 60 * MIN;
const START = Date.UTC(2026, 10, 2);
const at = (hours: number) => START + hours * H;

function span(
  device: IndexSpan['device'],
  app: string,
  category: IndexSpan['category'],
  from: number,
  minutes: number,
): IndexSpan {
  return {device, app, category, start: from, end: from + minutes * MIN};
}

function day(more: Partial<DayMoments>): DayMoments {
  return {
    start: START,
    end: START + 24 * H,
    spans: [],
    unlocks: [],
    notifications: [],
    focus: [],
    bedtime: null,
    ...more,
  };
}

describe('dayHours', () => {
  it('spreads the minutes over the hours they touch, deep work too', () => {
    const hours = dayHours(
      day({
        spans: [span('computer', 'code', 'development', at(10.5), 60)],
      }),
    );
    expect(hours.get(10)?.get('computer')).toBe(30);
    expect(hours.get(11)?.get('computer')).toBe(30);
    expect(hours.get(10)?.get('deepWork')).toBe(30);
    expect(hours.has(9)).toBe(false);
  });

  it('counts unlocks and notifications, and the busiest ten minutes of each hour', () => {
    const hours = dayHours(
      day({
        unlocks: [at(9.1), at(9.2), at(13)],
        notifications: [at(14), at(14) + MIN, at(14) + 2 * MIN, at(14.9)],
      }),
    );
    expect(hours.get(9)?.get('unlocks')).toBe(2);
    expect(hours.get(14)?.get('notifications')).toBe(4);
    expect(hours.get(14)?.get(NOTIFICATION_PEAK)).toBe(3);
  });

  it('marks the events at their hours: a game begun, a long phone session ended', () => {
    const hours = dayHours(
      day({
        spans: [
          span('computer', 'dota2', 'games', at(20.2), 50),
          span('phone', 'com.telegram', 'communication', at(22.5), 40),
          span('phone', 'com.instagram.android', 'media', at(8), 5),
        ],
        focus: [{start: at(15), end: at(15.75)}],
      }),
    );
    expect(hours.get(20)?.get('event.game')).toBe(1);
    expect(hours.get(23)?.get('event.longPhone')).toBe(1);
    expect(hours.get(8)?.get('event.draining')).toBe(1);
    expect(hours.get(15)?.get('event.focusEnd')).toBe(1);
    expect(hours.get(15)?.get('focus')).toBe(45);
    // A short game is not a game begun.
    const short = dayHours(
      day({spans: [span('computer', 'dota2', 'games', at(20), 3)]}),
    );
    expect(short.get(20)?.get('event.game')).toBeUndefined();
  });
});
