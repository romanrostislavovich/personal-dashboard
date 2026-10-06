import { BUDGET_TOTAL } from '@pd/contracts';

export interface BudgetRow {
  id: string;
  category: string;
  limit: number;
  warnedMonth: string | null;
  exceededMonth: string | null;
}

export interface BudgetAlert {
  budget: BudgetRow;
  level: 'warned' | 'exceeded';
  spent: number;
}

/** A budget is "almost spent" from this share of its limit. */
export const BUDGET_WARN_SHARE = 0.8;

/** What a category of a budget has spent: its own expenses, or all of them for the total. */
export function spentOf(budget: { category: string }, spent: ReadonlyMap<string, number>): number {
  if (budget.category === BUDGET_TOTAL) {
    return [...spent.values()].reduce((sum, value) => sum + value, 0);
  }
  const wanted = budget.category.toLowerCase();
  return [...spent].reduce(
    (sum, [category, value]) => (category.toLowerCase() === wanted ? sum + value : sum),
    0,
  );
}

/**
 * The budgets to speak of now: those past 80% or 100% of their limit in the month, each
 * level once a month (the higher one only, when both are new).
 */
export function budgetAlerts(
  budgets: BudgetRow[],
  spent: ReadonlyMap<string, number>,
  month: string,
): BudgetAlert[] {
  return budgets.flatMap((budget): BudgetAlert[] => {
    const used = spentOf(budget, spent);
    if (used >= budget.limit && budget.exceededMonth !== month) {
      return [{ budget, level: 'exceeded', spent: used }];
    }
    if (
      used >= budget.limit * BUDGET_WARN_SHARE &&
      used < budget.limit &&
      budget.warnedMonth !== month &&
      budget.exceededMonth !== month
    ) {
      return [{ budget, level: 'warned', spent: used }];
    }
    return [];
  });
}
