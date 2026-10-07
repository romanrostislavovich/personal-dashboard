import { filterTransactions, totalsByCategory } from './transaction-report';

const t = (
  kind: 'income' | 'expense',
  category: string,
  amount: number,
  note: string | null = null,
  currency = 'PLN',
  mainAmount: number | null = amount,
) => ({ kind, category, amount, currency, note, mainAmount });

const list = [
  t('expense', 'Продукты', 11.8, 'Żabka'),
  t('expense', 'Продукты', 250, 'Lidl'),
  t('expense', 'Транспорт', 30, 'Taxi Bolt'),
  t('expense', 'Hosting', 20, 'Hetzner', 'EUR', 86),
  t('expense', 'Hosting', 5, 'A domain', 'USD', null),
  t('income', 'Salary', 9000),
];

describe('filterTransactions', () => {
  it('finds by a part of the comment, however it is typed', () => {
    expect(filterTransactions(list, { search: 'zabka' }).map((x) => x.note)).toEqual(['Żabka']);
    expect(filterTransactions(list, { search: ' TAXI ' }).map((x) => x.note)).toEqual([
      'Taxi Bolt',
    ]);
    // The category is searched too.
    expect(filterTransactions(list, { search: 'host' })).toHaveLength(2);
  });

  it('narrows by the category and the kind', () => {
    expect(filterTransactions(list, { category: 'продукты' })).toHaveLength(2);
    expect(filterTransactions(list, { kind: 'income' }).map((x) => x.category)).toEqual(['Salary']);
    expect(filterTransactions(list, { category: 'Продукты', search: 'lidl' })).toHaveLength(1);
    expect(filterTransactions(list, {})).toHaveLength(list.length);
  });
});

describe('totalsByCategory', () => {
  it('gives every category, the largest first, expenses apart from income', () => {
    expect(totalsByCategory(list)).toEqual([
      {
        kind: 'expense',
        category: 'Продукты',
        count: 2,
        mainAmount: 261.8,
        amounts: { PLN: 261.8 },
        unconverted: 0,
      },
      {
        kind: 'expense',
        category: 'Hosting',
        count: 2,
        // The dollar one has no rate: counted, shown as recorded, left out of the main amount.
        mainAmount: 86,
        amounts: { EUR: 20, USD: 5 },
        unconverted: 1,
      },
      {
        kind: 'expense',
        category: 'Транспорт',
        count: 1,
        mainAmount: 30,
        amounts: { PLN: 30 },
        unconverted: 0,
      },
      {
        kind: 'income',
        category: 'Salary',
        count: 1,
        mainAmount: 9000,
        amounts: { PLN: 9000 },
        unconverted: 0,
      },
    ]);
  });
});
