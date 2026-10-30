import {
  dayBounds,
  mergeSpans,
  monthsBetween,
  secondsByDay,
  spanSeconds,
  subtractSpans,
} from './time-spans';

const MIN = 60_000;
const at = (minutes: number) => minutes * MIN;
const span = (from: number, to: number) => ({start: at(from), end: at(to)});

describe('time spans', () => {
  it('joins what overlaps or touches, once', () => {
    expect(
      mergeSpans([span(10, 20), span(0, 5), span(15, 30), span(30, 35)]),
    ).toEqual([span(0, 5), span(10, 35)]);
    expect(spanSeconds([span(0, 10), span(5, 15)])).toBe(15 * 60);
  });

  it('leaves what one source adds to another', () => {
    // The browser from 0 to 60, the tracker saw 10–20 and 50–70 of it.
    expect(subtractSpans([span(0, 60)], [span(10, 20), span(50, 70)])).toEqual([
      span(0, 10),
      span(20, 50),
    ]);
    expect(subtractSpans([span(0, 10)], [span(0, 10)])).toEqual([]);
  });

  it('shares a stretch over midnight between its days on the user clock', () => {
    const days = dayBounds(
      {from: '2026-10-01', to: '2026-10-02'},
      'Europe/Warsaw',
    );
    // 23:30–00:30 in Warsaw (UTC+2 in October).
    const start = Date.parse('2026-10-01T21:30:00Z');
    const byDay = secondsByDay([{start, end: start + 60 * MIN}], days);
    expect([...byDay]).toEqual([
      ['2026-10-01', 1800],
      ['2026-10-02', 1800],
    ]);
  });
});

describe('monthsBetween', () => {
  it('goes month by month over the turn of a year, with the last day of each', () => {
    expect(monthsBetween('2025-11-20', '2026-02-03')).toEqual([
      {from: '2025-11-01', to: '2025-11-30'},
      {from: '2025-12-01', to: '2025-12-31'},
      {from: '2026-01-01', to: '2026-01-31'},
      {from: '2026-02-01', to: '2026-02-28'},
    ]);
  });
});
