import { againstBudget, againstGoal } from './affordable';

describe('a wish against the money', () => {
  const goal = { name: 'Watch', saved: 250, currency: 'EUR' };

  it('tells how much the goal still lacks', () => {
    expect(againstGoal(300, goal)).toEqual({
      name: 'Watch',
      saved: 250,
      missing: 50,
      currency: 'EUR',
    });
    expect(againstGoal(200, goal)?.missing).toBe(0);
  });

  it('says nothing without a price', () => {
    expect(againstGoal(null, goal)).toBeNull();
    expect(againstBudget(null, { limit: 1000, spent: 100, currency: 'EUR' })).toBeNull();
  });

  it('tells what buying leaves of the budget of the month', () => {
    const budget = { limit: 1000, spent: 800, currency: 'EUR' };
    expect(againstBudget(150, budget)).toEqual({ left: 200, afterBuying: 50, currency: 'EUR' });
    expect(againstBudget(300, budget)?.afterBuying).toBe(-100);
    expect(againstBudget(300, undefined)).toBeNull();
  });
});
