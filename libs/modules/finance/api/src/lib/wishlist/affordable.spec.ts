import { againstBudget } from './affordable';

describe('a wish against the money', () => {
  it('says nothing without a price', () => {
    expect(againstBudget(null, { limit: 1000, spent: 100, currency: 'EUR' })).toBeNull();
  });

  it('tells what buying leaves of the budget of the month', () => {
    const budget = { limit: 1000, spent: 800, currency: 'EUR' };
    expect(againstBudget(150, budget)).toEqual({ left: 200, afterBuying: 50, currency: 'EUR' });
    expect(againstBudget(300, budget)?.afterBuying).toBe(-100);
    expect(againstBudget(300, undefined)).toBeNull();
  });
});
