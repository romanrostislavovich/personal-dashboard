import { ExpenseRow, priceRises, suggestSubscriptions, trialsEnding } from './subscription-rules';

const row = (note: string, amount: number, occurredOn: string): ExpenseRow => ({
  note,
  amount,
  currency: 'PLN',
  category: 'Subscriptions',
  occurredOn,
  recurringPaymentId: null,
});

describe('suggestSubscriptions', () => {
  const today = '2026-10-03';

  it('finds a monthly charge at the same price and day', () => {
    const rows = [
      row('spotify  ', 23.99, '2026-08-14'),
      row('Spotify', 23.99, '2026-09-14'),
      row('Spotify', 23.99, '2026-07-15'),
    ];
    const [suggestion] = suggestSubscriptions(rows, today, [], new Set());
    expect(suggestion).toMatchObject({
      key: 'spotify',
      name: 'Spotify',
      amount: 23.99,
      dayOfMonth: 14,
      months: ['2026-07', '2026-08', '2026-09'],
    });
  });

  it('leaves out a shop visited several times a month', () => {
    const rows = [
      row('Żabka', 12, '2026-08-01'),
      row('Żabka', 30, '2026-08-05'),
      row('Żabka', 12, '2026-09-01'),
    ];
    expect(suggestSubscriptions(rows, today, [], new Set())).toEqual([]);
  });

  it('leaves out different prices, scattered days and old charges', () => {
    const prices = [row('Doctor', 320, '2026-08-10'), row('Doctor', 465, '2026-09-10')];
    const days = [row('Bar', 36, '2026-08-02'), row('Bar', 36, '2026-09-25')];
    const old = [row('Gym', 99, '2026-05-10'), row('Gym', 99, '2026-06-10')];
    expect(suggestSubscriptions([...prices, ...days, ...old], today, [], new Set())).toEqual([]);
  });

  it('leaves out known and dismissed ones', () => {
    const rows = [
      row('Netflix.com', 43, '2026-08-20'),
      row('Netflix.com', 43, '2026-09-20'),
      row('Vape', 35, '2026-08-20'),
      row('Vape', 35, '2026-09-20'),
    ];
    expect(suggestSubscriptions(rows, today, ['Netflix'], new Set(['vape']))).toEqual([]);
  });
});

describe('priceRises', () => {
  const payment = {
    id: 'p1',
    name: 'Netflix',
    amount: 43,
    currency: 'PLN',
    isActive: true,
    noticedAmount: null,
  };

  it('reports a higher charge once', () => {
    const rows = [row('NETFLIX.COM', 49, '2026-09-20')];
    expect(priceRises([payment], rows)).toEqual([{ payment, amount: 49 }]);
    expect(priceRises([{ ...payment, noticedAmount: 49 }], rows)).toEqual([]);
  });

  it('ignores the same price and other currencies', () => {
    const rows = [
      row('Netflix', 43, '2026-09-20'),
      { ...row('Netflix', 60, '2026-09-21'), currency: 'EUR' },
    ];
    expect(priceRises([payment], rows)).toEqual([]);
  });
});

describe('trialsEnding', () => {
  const trial = { isActive: true, trialEndsOn: '2026-10-06', trialNotifiedFor: null };

  it('reminds 3 days ahead, once per end date', () => {
    expect(trialsEnding([trial], '2026-10-02')).toEqual([]);
    expect(trialsEnding([trial], '2026-10-03')).toEqual([trial]);
    expect(trialsEnding([{ ...trial, trialNotifiedFor: '2026-10-06' }], '2026-10-04')).toEqual([]);
  });

  it('skips paused payments and trials already over', () => {
    expect(trialsEnding([{ ...trial, isActive: false }], '2026-10-04')).toEqual([]);
    expect(trialsEnding([trial], '2026-10-07')).toEqual([]);
  });
});
