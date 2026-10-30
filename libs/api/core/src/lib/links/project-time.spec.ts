import {ProjectFact} from '@pd/contracts';
import {withCodingAtComputer} from './project-time';

const HOUR = 3600;
const time = (
  metric: 'seconds' | 'codingSeconds',
  days: [string, number][] | undefined,
): ProjectFact => ({
  module: metric === 'seconds' ? 'activity' : 'development',
  labelKey: metric,
  value: (days ?? []).reduce((sum, [, hours]) => sum + hours * HOUR, 0),
  unit: 'seconds',
  metric,
  days: days?.map(([day, hours]) => ({day, seconds: hours * HOUR})),
});

describe('withCodingAtComputer', () => {
  it('takes the larger of the two times on each day and tells what the IDE added', () => {
    const facts = withCodingAtComputer([
      time('seconds', [
        ['2026-10-01', 5],
        ['2026-10-02', 1],
      ]),
      time('codingSeconds', [
        ['2026-10-01', 2],
        ['2026-10-02', 4],
        ['2026-10-03', 3],
      ]),
    ]);
    // 5 + max(1, 4) + 3: the first day the tracker saw more, the others the IDE.
    expect(facts[0]).toMatchObject({value: 12 * HOUR, fromCoding: 6 * HOUR});
    expect(facts[1].value).toBe(9 * HOUR);
  });

  it('leaves the facts alone when the tracker saw all of the coding', () => {
    const facts = [
      time('seconds', [['2026-10-01', 5]]),
      time('codingSeconds', [['2026-10-01', 2]]),
    ];
    expect(withCodingAtComputer(facts)).toBe(facts);
  });

  it('adds nothing without the tracker time, or without the times day by day', () => {
    const coding = time('codingSeconds', [['2026-10-01', 2]]);
    expect(withCodingAtComputer([coding])).toEqual([coding]);
    const tracked = time('seconds', undefined);
    expect(withCodingAtComputer([tracked, coding])).toEqual([tracked, coding]);
  });
});
