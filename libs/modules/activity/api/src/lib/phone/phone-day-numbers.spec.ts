import {phoneDayMetrics} from './phone-day-numbers';

const rows = {
  apps: [
    {day: '2026-11-01', app: 'org.telegram.messenger', seconds: 1800},
    {day: '2026-11-01', app: 'com.example.notes', seconds: 1800},
    {day: '2026-11-02', app: 'org.telegram.messenger', seconds: 3600},
  ],
  notifications: [
    {day: '2026-11-01', app: 'org.telegram.messenger', count: 30},
    {day: '2026-11-01', app: 'com.example.bank', count: 2},
  ],
  busiest: [{day: '2026-11-01', count: 12}],
  told: ['2026-11-01', '2026-11-02', '2026-11-03'],
};
const byKey = (metrics: ReturnType<typeof phoneDayMetrics>) =>
  new Map(metrics.map(metric => [metric.key, metric]));

describe('phoneDayMetrics', () => {
  const metrics = byKey(phoneDayMetrics(rows, new Map()));

  it('gives the hours and each category of them, a part of the hours', () => {
    expect(metrics.get('activity.phone.hours')?.days[0]).toEqual({
      day: '2026-11-01',
      value: 1,
    });
    const messengers = metrics.get('activity.phone.category.communication');
    expect(messengers?.partOf).toBe('activity.phone.hours');
    expect(messengers?.extra).toBeUndefined();
    expect(messengers?.days.map(day => day.value)).toEqual([0.5, 1, 0]);
    expect(metrics.get('activity.phone.category.other')?.extra).toBe(true);
  });

  it('counts the notifications on every reported day, the silent ones as zero', () => {
    expect(
      metrics.get('activity.phone.notifications')?.days.map(day => day.value),
    ).toEqual([32, 0, 0]);
    expect(
      metrics.get('activity.phone.messengerNotifications')?.days[0].value,
    ).toBe(30);
    expect(metrics.get('activity.phone.notificationPeak')?.days[0].value).toBe(
      12,
    );
  });

  it("takes the user's own category of an app", () => {
    const own = byKey(
      phoneDayMetrics(rows, new Map([['com.example.notes', 'office']])),
    );
    expect(own.get('activity.phone.category.office')?.days[0].value).toBe(0.5);
    expect(own.has('activity.phone.category.other')).toBe(false);
  });

  it('gives nothing when the phone never reported apps or notifications', () => {
    expect(
      phoneDayMetrics(
        {apps: [], notifications: [], busiest: [], told: ['2026-11-01']},
        new Map(),
      ),
    ).toEqual([]);
  });
});
