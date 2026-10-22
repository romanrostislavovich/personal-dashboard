import { Wish } from '@pd/contracts';
import { round } from '../currency/conversion';

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
