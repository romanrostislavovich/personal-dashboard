import { lastMonths, monthOf } from './project-months';

describe('lastMonths', () => {
  it('goes back over the turn of a year, oldest first, with the days of each month', () => {
    expect(lastMonths('2026-02-14', 4)).toEqual([
      { month: '2025-11', from: '2025-11-01', to: '2025-11-30' },
      { month: '2025-12', from: '2025-12-01', to: '2025-12-31' },
      { month: '2026-01', from: '2026-01-01', to: '2026-01-31' },
      { month: '2026-02', from: '2026-02-01', to: '2026-02-28' },
    ]);
  });
});

describe('monthOf', () => {
  it('takes the hours and the money out of the facts of a month', () => {
    const base = { module: 'x', labelKey: 'x' };
    expect(
      monthOf('2026-09', [
        { ...base, value: 7200, unit: 'seconds', metric: 'seconds' },
        { ...base, value: 3600, unit: 'seconds', metric: 'codingSeconds' },
        { ...base, value: 500, unit: 'money', currency: 'EUR', metric: 'income' },
        { ...base, value: 40.5, unit: 'money', currency: 'EUR', metric: 'expense' },
        { ...base, value: 3, unit: 'count' },
      ]),
    ).toEqual({
      month: '2026-09',
      seconds: 7200,
      codingSeconds: 3600,
      income: 500,
      expense: 40.5,
      currency: 'EUR',
    });
  });
});
