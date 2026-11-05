import {focusSessionMetrics} from './activity.links';

describe('focusSessionMetrics', () => {
  it("gives the share finished and the minutes lost, by the user's day", () => {
    const [finished, distracted] = focusSessionMetrics(
      [
        {
          startedAt: '2026-11-01T09:00:00Z',
          completed: true,
          distractions: [{seconds: 120}],
        },
        {
          startedAt: '2026-11-01T12:00:00Z',
          completed: false,
          distractions: [{seconds: 60}, {seconds: 60}],
        },
        // 00:30 in Warsaw is already the 2nd.
        {startedAt: '2026-11-01T23:30:00Z', completed: true, distractions: []},
      ],
      'Europe/Warsaw',
    );
    expect(finished.days).toEqual([
      {day: '2026-11-01', value: 50},
      {day: '2026-11-02', value: 100},
    ]);
    expect(distracted.days).toEqual([
      {day: '2026-11-01', value: 4},
      {day: '2026-11-02', value: 0},
    ]);
  });

  it('gives nothing without sessions', () => {
    expect(focusSessionMetrics([], 'UTC')).toEqual([]);
  });
});
