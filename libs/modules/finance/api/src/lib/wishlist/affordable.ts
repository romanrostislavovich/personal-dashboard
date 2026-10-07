import { Wish } from '@pd/contracts';
import { round } from '../currency/conversion';

/**
 * Whether the goal a wish is saved for has enough: `price` is the wish's price in the goal's
 * currency. `null` — the price is unknown, or the rate of its currency is.
 */
export function againstGoal(
  price: number | null | undefined,
  goal: { name: string; saved: number; currency: string },
): Wish['goal'] {
  if (price == null) {
    return null;
  }
  return {
    name: goal.name,
    saved: round(goal.saved),
    missing: round(Math.max(0, price - goal.saved)),
    currency: goal.currency,
  };
}

/**
 * What buying a wish leaves of the month's budget of all expenses: `price` is the wish's price
 * in the main currency. A negative `afterBuying` is how far over the budget it would go.
 */
export function againstBudget(
  price: number | null | undefined,
  budget: { limit: number; spent: number; currency: string } | undefined,
): Wish['budget'] {
  if (price == null || !budget) {
    return null;
  }
  const left = budget.limit - budget.spent;
  return { left: round(left), afterBuying: round(left - price), currency: budget.currency };
}
