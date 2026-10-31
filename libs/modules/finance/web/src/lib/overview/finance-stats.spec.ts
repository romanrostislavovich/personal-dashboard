import {Transaction} from '@pd/contracts';
import {categoryIcon} from './category-icon';
import {
  cashFlowMonths,
  categoryShares,
  groupByDay,
  monthKey,
  relativeChange,
  topCurrency,
  trimEmptyStart,
} from './finance-stats';

const transaction = (values: Partial<Transaction>): Transaction => ({
  id: crypto.randomUUID(),
  kind: 'expense',
  amount: 10,
  currency: 'PLN',
  category: 'Food',
  note: null,
  occurredOn: '2026-10-31',
  projectId: null,
  recurringPaymentId: null,
  costSourceId: null,
  hasReceipt: false,
  mainAmount: null,
  updatedAt: null,
  ...values,
});

describe('finance overview', () => {
  it('folds the smaller categories into "Other" only when two or more are left', () => {
    const many = Array.from({length: 9}, (_, i) =>
      transaction({category: `c${i}`, amount: 100 - i}),
    );
    const shares = categoryShares(many, 'PLN');
    expect(shares).toHaveLength(8);
    expect(shares.at(-1)).toMatchObject({
      category: null,
      categories: ['c7', 'c8'],
      amount: 185,
      count: 2,
    });
    expect(shares.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1);

    const eight = many.slice(0, 8);
    expect(
      categoryShares(eight, 'PLN').every(row => row.category !== null),
    ).toBe(true);
  });

  it('counts one currency and one kind', () => {
    const shares = categoryShares(
      [
        transaction({amount: 30}),
        transaction({amount: 5, currency: 'EUR'}),
        transaction({amount: 99, kind: 'income'}),
      ],
      'PLN',
    );
    expect(shares).toEqual([
      {category: 'Food', categories: ['Food'], amount: 30, count: 1, share: 1},
    ]);
  });

  it('groups by day with a net sum per currency', () => {
    const groups = groupByDay([
      transaction({occurredOn: '2026-10-31', amount: 10.1}),
      transaction({occurredOn: '2026-10-31', kind: 'income', amount: 50}),
      transaction({occurredOn: '2026-10-30', currency: 'EUR', amount: 3}),
    ]);
    expect(groups.map(group => group.day)).toEqual([
      '2026-10-31',
      '2026-10-30',
    ]);
    expect(groups[0].totals).toEqual([{currency: 'PLN', net: 39.9}]);
    expect(groups[1].totals).toEqual([{currency: 'EUR', net: -3}]);
  });

  it('builds the months of the chart with zeros and trims the empty start', () => {
    const months = cashFlowMonths(
      [{month: '2026-10', currency: 'PLN', income: 100, expense: 40}],
      'PLN',
      {year: 2026, month: 10},
      3,
    );
    expect(months.map(m => monthKey(m.month))).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(trimEmptyStart(months)).toHaveLength(1);
    expect(
      trimEmptyStart(months.map(m => ({...m, income: 0, expense: 0}))),
    ).toHaveLength(1);
  });

  it('picks the currency most money moved in, and a relative change', () => {
    expect(
      topCurrency([
        {month: '2026-10', currency: 'EUR', income: 10, expense: 5},
        {month: '2026-10', currency: 'PLN', income: 100, expense: 40},
      ]),
    ).toBe('PLN');
    expect(topCurrency([])).toBeNull();
    expect(relativeChange(112, 100)).toBeCloseTo(0.12);
    expect(relativeChange(5, 0)).toBeNull();
  });

  it('finds an icon for a category typed in either language', () => {
    expect(categoryIcon('Продукты', 'expense')).toBe('shopping_cart');
    expect(categoryIcon('Taxi', 'expense')).toBe('local_taxi');
    expect(categoryIcon('Зарплата', 'income')).toBe('payments');
    expect(categoryIcon('Something else', 'expense')).toBe('sell');
    expect(categoryIcon(null, 'income')).toBe('savings');
  });
});
