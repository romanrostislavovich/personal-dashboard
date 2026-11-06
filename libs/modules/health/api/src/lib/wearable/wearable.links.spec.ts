import {WearableDay} from '@pd/contracts';
import {bedtimeSpread} from './wearable.links';

const night = (day: string, sleepStart: string | null) =>
  ({day, sleepStart}) as WearableDay;

describe('bedtimeSpread', () => {
  it('is the spread of the week, after midnight counted past 24', () => {
    const days = [
      night('2026-11-01', '23:00'),
      night('2026-11-02', '01:00'),
      night('2026-11-03', '23:00'),
      night('2026-11-04', '01:00'),
    ];
    expect(bedtimeSpread(days, '2026-11-04')).toBe(1);
  });

  it('needs four nights of the week', () => {
    expect(
      bedtimeSpread([night('2026-11-01', '23:00')], '2026-11-01'),
    ).toBeNull();
  });
});
