import { DailyMetric } from '@pd/contracts';
import { seriesOf } from './daily-series';
import { moodInsights } from './mood-insights';

const days = Array.from({ length: 8 }, (_, index) => `2026-10-0${index + 1}`);
const metric: DailyMetric = {
  key: 'activity.telemetry.desktop.contextSwitches', module: 'activity', labelKey: 'switches', unit: 'count', missing: 'absent',
  days: [{ day: days[0], value: 5 }, { day: days[2], value: 0 }],
};
const mood: DailyMetric = {
  key: 'diary.mood', module: 'diary', labelKey: 'mood', unit: 'score',
  days: days.map((day, index) => ({ day, value: index < 3 ? 5 : 1 })),
};
const period = { from: days[0], to: days[7] };

describe('opt-in metric missing days', () => {
  it('omits missing observations but preserves actually measured zeroes', () => {
    expect([...seriesOf(metric, days)]).toEqual([[days[0], 5], [days[2], 0]]);
    expect(seriesOf({ ...metric, missing: undefined }, days).get(days[1])).toBe(0);
  });
  it('does not manufacture a mood difference from unobserved days', () => {
    const telemetry = { ...metric, days: days.slice(0, 6).map((day) => ({ day, value: 10 })) };
    expect(moodInsights([mood, telemetry], period).insights).toEqual([]);
  });
  it('counts measured zeroes and keeps the physical unit and relative comparison', () => {
    const telemetry = { ...metric, days: days.slice(0, 6).map((day, index) => ({ day, value: index < 3 ? 0 : 10 })) };
    expect(moodInsights([mood, telemetry], period).insights[0]).toMatchObject({ unit: 'count', reading: false, onGoodDays: 0, onBadDays: 10 });
  });
});