import { ActivityTimelineEntry } from '@pd/contracts';
import { digestTimeline } from './timeline-digest';

/** Minutes of 2026-10-05 in UTC; Warsaw is two hours ahead in October. */
const span = (
  fromMinute: number,
  toMinute: number,
  app: string,
  title: string,
): ActivityTimelineEntry => ({
  startedAt: new Date(Date.UTC(2026, 9, 5, 0, fromMinute)).toISOString(),
  endedAt: new Date(Date.UTC(2026, 9, 5, 0, toMinute)).toISOString(),
  app: `${app}.exe`,
  name: app,
  title,
  category: 'development',
  deviceId: 'pc',
});

const digest = (entries: ActivityTimelineEntry[], options = {}) =>
  digestTimeline(entries, 'Europe/Warsaw', { limit: 100, ...options });

describe('digestTimeline', () => {
  it('joins the spans of one window and puts them on the user’s clock, oldest first', () => {
    const result = digest([
      // Newest first, as the service gives them.
      span(430, 440, 'Chrome', 'Docs'),
      span(425, 430, 'WebStorm', 'dashboard'),
      span(420, 425, 'WebStorm', 'dashboard'),
    ]);
    expect(result).toEqual({
      total: 2,
      stretches: [
        {
          from: '09:00',
          to: '09:10',
          minutes: 10,
          app: 'WebStorm',
          title: 'dashboard',
          category: 'development',
        },
        {
          from: '09:10',
          to: '09:20',
          minutes: 10,
          app: 'Chrome',
          title: 'Docs',
          category: 'development',
        },
      ],
    });
  });

  it('does not join over a real break, or two different windows', () => {
    const result = digest([
      span(420, 425, 'WebStorm', 'dashboard'),
      span(440, 445, 'WebStorm', 'dashboard'),
      span(445, 450, 'WebStorm', 'another project'),
    ]);
    expect(result.stretches.map((s) => `${s.from} ${s.title}`)).toEqual([
      '09:00 dashboard',
      '09:20 dashboard',
      '09:25 another project',
    ]);
  });

  it('keeps to the hours asked for', () => {
    const entries = [
      span(420, 480, 'WebStorm', 'morning'),
      span(600, 660, 'Dota', 'afternoon'),
      span(900, 960, 'Chrome', 'evening'),
    ];
    const afternoon = digest(entries, { fromTime: '11:30', toTime: '14:00' });
    expect(afternoon.stretches.map((s) => s.title)).toEqual(['afternoon']);
    expect(digest(entries, { fromTime: '16:00' }).stretches.map((s) => s.title)).toEqual([
      'evening',
    ]);
  });

  it('cuts a long day to the longest stretches and says so', () => {
    const entries = [
      span(420, 422, 'A', 'short'),
      span(430, 500, 'B', 'long'),
      span(510, 512, 'C', 'short too'),
      span(520, 560, 'D', 'medium'),
    ];
    const result = digest(entries, { limit: 2 });
    expect(result.total).toBe(4);
    expect(result.stretches.map((s) => s.title)).toEqual(['long', 'medium']);
    expect(result.note).toContain('2 longest of 4');
  });
});
