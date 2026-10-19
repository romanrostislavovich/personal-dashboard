import { describe, expect, it } from 'vitest';
import { findLeaks, LeakInput, LeakPayment } from './leaks';
import { ExpenseRow } from './subscription-rules';

const today = '2026-10-19';

const charge = (note: string, occurredOn: string, amount: number): ExpenseRow => ({
  note,
  amount,
  currency: 'PLN',
  category: 'Subscriptions',
  occurredOn,
  recurringPaymentId: null,
});

const input = (fields: Partial<LeakInput>): LeakInput => ({
  rows: [],
  payments: [],
  unused: [],
  suggestions: [],
  dates: [],
  today,
  ...fields,
});

const payment = (fields: Partial<LeakPayment>): LeakPayment => ({
  id: 'p',
  name: 'Netflix',
  amount: 60,
  currency: 'PLN',
  period: 'month',
  isActive: true,
  priceHistory: [],
  ...fields,
});

describe('findLeaks', () => {
  it('finds a price that crept up month after month', () => {
    const rows = [
      charge('Spotify P123', '2026-07-05', 23.99),
      charge('Spotify P123', '2026-08-05', 23.99),
      charge('Spotify P123', '2026-09-05', 26.99),
      charge('Spotify P123', '2026-10-05', 29.99),
    ];
    const [leak] = findLeaks(input({ rows }));
    expect(leak).toMatchObject({ kind: 'rising', previous: 23.99, amount: 29.99 });
    expect(leak.yearly).toBeCloseTo(72);
  });

  it('leaves out a shop that is not taken once a month', () => {
    const rows = ['03', '04', '05', '06'].flatMap((m) => [
      charge('Biedronka', `2026-${m}-02`, 50),
      charge('Biedronka', `2026-${m}-20`, 80),
    ]);
    expect(findLeaks(input({ rows }))).toEqual([]);
  });

  it('tells a recorded payment raised within the year', () => {
    const payments = [
      payment({
        priceHistory: [
          { amount: 55, changedOn: '2026-06-01' },
          { amount: 49, changedOn: '2026-01-10' },
        ],
      }),
    ];
    const [leak] = findLeaks(input({ payments }));
    expect(leak).toMatchObject({ kind: 'rising', paymentId: 'p', previous: 49, yearly: 132 });
  });

  it('finds a subscription charged twice in a month', () => {
    const rows = [
      charge('YouTube Premium', '2026-07-12', 25.99),
      charge('YouTube Premium', '2026-08-12', 25.99),
      charge('YouTube Premium', '2026-09-12', 25.99),
      charge('YouTube Premium', '2026-09-14', 25.99),
    ];
    const leaks = findLeaks(input({ rows }));
    expect(leaks).toEqual([
      expect.objectContaining({ kind: 'double', date: '2026-09-01', yearly: 25.99 }),
    ]);
  });

  it('gathers the unused, the never recorded and the near renewals', () => {
    const leaks = findLeaks(
      input({
        payments: [payment({ id: 'gym', name: 'Gym', amount: 150 })],
        unused: ['gym'],
        suggestions: [
          {
            key: 'icloud',
            name: 'iCloud',
            amount: 4.99,
            currency: 'PLN',
            category: 'Subscriptions',
            dayOfMonth: 3,
            months: ['2026-08', '2026-09'],
          },
        ],
        dates: [
          {
            paymentId: 'd',
            name: 'Domain',
            kind: 'renewal',
            date: '2026-11-02',
            amount: 60,
            currency: 'PLN',
          },
          {
            paymentId: 'x',
            name: 'Far',
            kind: 'renewal',
            date: '2027-03-01',
            amount: 9,
            currency: 'PLN',
          },
        ],
      }),
    );
    expect(leaks.map((leak) => `${leak.kind} ${leak.name} ${leak.yearly}`)).toEqual([
      'unused Gym 1800',
      'hidden iCloud 59.88',
      'renewal Domain 0',
    ]);
  });
});
