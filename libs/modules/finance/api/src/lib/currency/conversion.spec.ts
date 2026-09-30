import { convertAll, DailyRates, rateOn, rateRange } from './conversion';

const daily: DailyRates = new Map([
  ['2026-09-25', { PLN: 4.3718, USD: 1.1403 }],
  ['2026-09-28', { PLN: 4.373, USD: 1.1378 }],
]);

describe('rateOn', () => {
  it('takes the last published rate on a weekend', () => {
    expect(rateOn(daily, 'PLN', '2026-09-27')).toBe(4.3718);
    expect(rateOn(daily, 'PLN', '2026-09-28')).toBe(4.373);
    expect(rateOn(daily, 'EUR', '2026-09-27')).toBe(1);
    expect(rateOn(daily, 'UAH', '2026-09-28')).toBeNull();
  });
});

describe('convertAll', () => {
  it('converts through EUR at the rate of the day', () => {
    const { values, approximate, missing } = convertAll(
      [
        { amount: 100, currency: 'EUR', day: '2026-09-28' },
        { amount: 10, currency: 'USD', day: '2026-09-27' },
        { amount: 50, currency: 'PLN', day: '2026-09-28' },
      ],
      'PLN',
      daily,
      {},
    );
    expect(values).toEqual([437.3, 38.34, 50]); // 10 USD → 10 / 1.1403 EUR → × 4.3718 PLN
    expect(approximate).toEqual([]);
    expect(missing).toEqual([]);
  });

  it('uses today’s rate for a currency without daily ones, and says so', () => {
    const result = convertAll(
      [
        { amount: 1000, currency: 'UAH', day: '2026-09-28' },
        { amount: 5, currency: 'XYZ', day: '2026-09-28' },
      ],
      'PLN',
      daily,
      { UAH: 48 },
    );
    expect(result.values).toEqual([91.1, null]); // 1000 / 48 × 4.373
    expect(result.approximate).toEqual(['UAH']);
    expect(result.missing).toEqual(['XYZ']);
  });
});

describe('rateRange', () => {
  it('starts a week before the first day', () => {
    expect(
      rateRange([
        { amount: 1, currency: 'USD', day: '2026-09-10' },
        { amount: 1, currency: 'USD', day: '2026-09-01' },
      ]),
    ).toEqual({ from: '2026-08-25', to: '2026-09-10' });
    expect(rateRange([])).toBeNull();
  });
});
