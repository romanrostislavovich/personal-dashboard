import {breakdownMetrics} from './development-metrics';

const day = (index: number) => `2026-10-${String(index + 1).padStart(2, '0')}`;
const days = Array.from({length: 12}, (_, index) => day(index));

describe('breakdownMetrics', () => {
  const rows = [
    ...days.map(one => ({day: one, name: 'Dashboard', seconds: 3600})),
    ...days.slice(0, 3).map(one => ({day: one, name: 'Rare', seconds: 3600})),
  ];

  it('makes a part of the coding time of a project of enough days', () => {
    const [dashboard, ...rest] = breakdownMetrics(rows, days, 'project');
    expect(rest).toEqual([]);
    expect(dashboard).toMatchObject({
      key: 'development.project.dashboard',
      label: 'Dashboard',
      partOf: 'development.coding',
    });
    expect(dashboard.extra).toBeUndefined();
    expect(dashboard.days[0]).toEqual({day: day(0), value: 1});
  });

  it('gives a coding day without it a zero, and keeps languages extra', () => {
    const more = [...days, day(20)];
    const [language] = breakdownMetrics(rows, more, 'language');
    expect(language.extra).toBe(true);
    expect(language.days.at(-1)).toEqual({day: day(20), value: 0});
  });
});
