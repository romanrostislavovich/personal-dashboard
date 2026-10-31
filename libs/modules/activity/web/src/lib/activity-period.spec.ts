import {ActivityTimelineEntry} from '@pd/contracts';
import {joinTimeline, lastDays, localDay, secondsOf} from './activity-period';

const span = (
  startedAt: string,
  endedAt: string,
  values: Partial<ActivityTimelineEntry> = {},
): ActivityTimelineEntry => ({
  startedAt,
  endedAt,
  app: 'code.exe',
  name: 'VS Code',
  title: 'dashboard',
  category: 'work',
  deviceId: 'pc',
  ...values,
});

describe('activity periods', () => {
  it('counts the last days with today included', () => {
    const now = new Date(2026, 9, 31, 12);
    expect(localDay(now)).toBe('2026-10-31');
    expect(lastDays(1, now)).toEqual({from: '2026-10-31', to: '2026-10-31'});
    expect(lastDays(7, now)).toEqual({from: '2026-10-25', to: '2026-10-31'});
    expect(lastDays(30, new Date(2026, 2, 1, 12)).from).toBe('2026-01-31');
  });

  it('joins the spans of one window back into one stretch', () => {
    // Newest first, as the server sends them.
    const joined = joinTimeline([
      span('2026-10-31T10:05:00Z', '2026-10-31T10:10:00Z'),
      span('2026-10-31T10:00:00Z', '2026-10-31T10:04:50Z'),
      span('2026-10-31T09:00:00Z', '2026-10-31T09:30:00Z'),
      span('2026-10-31T08:59:00Z', '2026-10-31T09:00:00Z', {title: 'other'}),
    ]);
    expect(joined).toHaveLength(3);
    expect(joined[0]).toMatchObject({
      startedAt: '2026-10-31T10:00:00Z',
      endedAt: '2026-10-31T10:10:00Z',
    });
    expect(secondsOf(joined[0])).toBe(600);
  });

  it('keeps apart other devices and gaps longer than a moment', () => {
    const joined = joinTimeline([
      span('2026-10-31T10:05:00Z', '2026-10-31T10:10:00Z'),
      span('2026-10-31T10:00:00Z', '2026-10-31T10:04:00Z'),
      span('2026-10-31T09:00:00Z', '2026-10-31T09:59:59Z', {deviceId: 'mac'}),
    ]);
    expect(joined).toHaveLength(3);
  });
});
