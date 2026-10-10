import { moodPatterns } from './patterns';

const period = { from: '2026-09-28', to: '2026-10-11' };
// 28 Sep 2026 is a Monday.
const mood = [
  { day: '2026-09-28', value: 4 },
  { day: '2026-09-29', value: 2 },
  { day: '2026-09-30', value: 1 },
  { day: '2026-10-01', value: 2 },
  { day: '2026-10-03', value: 2 },
  { day: '2026-10-05', value: 5 },
  { day: '2026-10-06', value: 4 },
];

describe('moodPatterns', () => {
  it('averages the mood by the day of the week and week by week', () => {
    const result = moodPatterns(mood, [], period);
    expect(result.days).toBe(7);
    expect(result.byWeekday[0]).toEqual({ weekday: 0, average: 4.5, days: 2 });
    expect(result.byWeekday[6]).toEqual({ weekday: 6, average: null, days: 0 });
    expect(result.weeks).toEqual([
      { week: '2026-09-28', average: 2.2, days: 5 },
      { week: '2026-10-05', average: 4.5, days: 2 },
    ]);
  });

  it('finds the longest run of low days; a day without a mood breaks it', () => {
    // 29, 30 Sep and 1 Oct in a row; 3 Oct stands apart (2 Oct has no mood).
    expect(moodPatterns(mood, [], period).longestLowRun).toEqual({ days: 3, from: '2026-09-29' });
    expect(moodPatterns([{ day: '2026-10-01', value: 4 }], [], period).longestLowRun).toBeNull();
  });

  it('tells the mood during the events that touch the period', () => {
    const events = [
      { id: 'a', title: 'A cold', startedOn: '2026-09-29', endedOn: '2026-10-01' },
      { id: 'b', title: 'A day off', startedOn: '2026-10-05', endedOn: null },
      { id: 'c', title: 'Long ago', startedOn: '2026-01-01', endedOn: '2026-01-05' },
      { id: 'd', title: 'No mood then', startedOn: '2026-10-09', endedOn: '2026-10-10' },
    ];
    expect(moodPatterns(mood, events, period).events).toEqual([
      { id: 'd', title: 'No mood then', from: '2026-10-09', to: '2026-10-10', mood: null },
      { id: 'b', title: 'A day off', from: '2026-10-05', to: '2026-10-05', mood: 5 },
      { id: 'a', title: 'A cold', from: '2026-09-29', to: '2026-10-01', mood: 1.67 },
    ]);
  });

  it('copes with no mood at all', () => {
    expect(moodPatterns([], [], period)).toMatchObject({ days: 0, average: null, weeks: [] });
  });
});
