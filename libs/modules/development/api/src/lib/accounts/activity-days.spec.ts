import { ActivityEvent } from './account-source';
import { activityDays } from './activity-days';

const event = (at: string, kind: ActivityEvent['kind'], amount = 1): ActivityEvent => ({
  at: new Date(at),
  kind,
  contributions: 1,
  amount,
});

describe('activityDays', () => {
  it('adds up the events of a day and keeps what they were made of', () => {
    const days = activityDays(
      [
        event('2026-03-04T09:00:00Z', 'commit', 3),
        event('2026-03-04T15:00:00Z', 'pullRequest'),
        event('2026-03-02T12:00:00Z', 'other'),
      ],
      'UTC',
    );
    expect(days).toEqual([
      { day: '2026-03-02', count: 1, commits: 0, pullRequests: 0, reviews: 0, issues: 0 },
      { day: '2026-03-04', count: 2, commits: 3, pullRequests: 1, reviews: 0, issues: 0 },
    ]);
  });

  it('puts an event into the day of the given time zone', () => {
    const [day] = activityDays([event('2026-03-04T22:30:00Z', 'issue')], 'Europe/Kyiv');
    expect(day.day).toBe('2026-03-05');
  });
});
