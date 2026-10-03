import { budgetAlerts, BudgetRow, spentOf } from './budget-rules';

const budget = (category: string, limit: number, extra: Partial<BudgetRow> = {}): BudgetRow => ({
  id: category,
  category,
  limit,
  warnedMonth: null,
  exceededMonth: null,
  ...extra,
});
const spent = new Map([
  ['Еда', 850],
  ['еда', 50],
  ['Кафе', 300],
  ['Такси', 20],
]);

describe('spentOf', () => {
  it('adds up a category whatever its case, and everything for the total', () => {
    expect(spentOf({ category: 'ЕДА' }, spent)).toBe(900);
    expect(spentOf({ category: '*' }, spent)).toBe(1220);
  });
});

describe('budgetAlerts', () => {
  it('warns at 80% and tells of 100%, the higher level only', () => {
    const alerts = budgetAlerts(
      [budget('Еда', 1000), budget('Кафе', 250), budget('Такси', 500), budget('*', 1500)],
      spent,
      '2026-10',
    );
    expect(alerts.map((a) => [a.budget.category, a.level, a.spent])).toEqual([
      ['Еда', 'warned', 900],
      ['Кафе', 'exceeded', 300],
      ['*', 'warned', 1220],
    ]);
  });

  it('speaks of each level once a month', () => {
    const told = budget('Еда', 1000, { warnedMonth: '2026-10' });
    expect(budgetAlerts([told], spent, '2026-10')).toEqual([]);
    expect(budgetAlerts([told], spent, '2026-11')).toHaveLength(1);
    const over = budget('Кафе', 250, { exceededMonth: '2026-10' });
    expect(budgetAlerts([over], spent, '2026-10')).toEqual([]);
  });
});
