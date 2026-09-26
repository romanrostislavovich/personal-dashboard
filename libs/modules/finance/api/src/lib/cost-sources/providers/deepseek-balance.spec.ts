import { consumptionBetween, pickBalance } from './deepseek-balance';

describe('consumptionBetween', () => {
  it('knows nothing on the first measurement', () => {
    expect(consumptionBetween(null, 50)).toBe(0);
  });

  it('counts a balance decrease as spending', () => {
    expect(consumptionBetween(50, 47.35)).toBe(2.65);
  });

  it('treats a balance increase as a top-up, not spending', () => {
    expect(consumptionBetween(10, 60)).toBe(0);
  });
});

describe('pickBalance', () => {
  it('prefers USD when several currencies are present', () => {
    expect(
      pickBalance([
        { currency: 'CNY', total_balance: '100.00' },
        { currency: 'USD', total_balance: '12.50' },
      ]),
    ).toEqual({ currency: 'USD', balance: 12.5 });
  });

  it('falls back to the only currency', () => {
    expect(pickBalance([{ currency: 'CNY', total_balance: '7' }])).toEqual({
      currency: 'CNY',
      balance: 7,
    });
  });
});
