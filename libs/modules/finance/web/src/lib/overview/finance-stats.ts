import { LocalDate, MonthCashFlow, Transaction } from '@pd/contracts';
import { Month, shiftMonth } from '@pd/web-core';

/** Categories beyond this many are folded into "Other" — the list stays readable. */
const MAX_CATEGORIES = 7;

export interface CategoryShare {
  /** null — the "Other" row with the smaller categories. */
  category: string | null;
  /** The categories behind the row: one, or all the folded ones for "Other". */
  categories: string[];
  amount: number;
  count: number;
  /** 0–1 of the total. */
  share: number;
}

/** What the transaction list shows after a click in the overview: one category or "Other". */
export interface CategoryFilter {
  /** null — "Other". */
  label: string | null;
  categories: string[];
  /** The breakdown counts one kind: the list shows the same transactions it counted. */
  kind: Transaction['kind'];
}

export interface DayGroup {
  day: LocalDate;
  transactions: Transaction[];
  /** Net sum per currency for the day header: income minus expenses. */
  totals: { currency: string; net: number }[];
}

export interface CashFlowMonth {
  month: Month;
  income: number;
  expense: number;
}

/** `YYYY-MM` — the month key used by the cash flow endpoint. */
export function monthKey({ year, month }: Month): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** The currency the month mostly lives in: most money moved. */
export function topCurrency(flows: MonthCashFlow[]): string | null {
  const [top] = [...flows].sort((a, b) => b.income + b.expense - (a.income + a.expense));
  return top?.currency ?? null;
}

/** The last `count` months up to `last`, oldest first, with zeros for empty months. */
export function cashFlowMonths(
  flows: MonthCashFlow[],
  currency: string,
  last: Month,
  count: number,
): CashFlowMonth[] {
  return Array.from({ length: count }, (_, i) => {
    const month = shiftMonth(last, i - count + 1);
    const flow = flows.find((f) => f.month === monthKey(month) && f.currency === currency);
    return { month, income: flow?.income ?? 0, expense: flow?.expense ?? 0 };
  });
}

/** Expenses (or income) of one currency by category, largest first. */
export function categoryShares(
  transactions: Transaction[],
  currency: string,
  kind: Transaction['kind'] = 'expense',
): CategoryShare[] {
  const byCategory = new Map<string, { amount: number; count: number }>();
  for (const t of transactions) {
    if (t.currency !== currency || t.kind !== kind) {
      continue;
    }
    const entry = byCategory.get(t.category) ?? { amount: 0, count: 0 };
    entry.amount += t.amount;
    entry.count += 1;
    byCategory.set(t.category, entry);
  }
  const total = [...byCategory.values()].reduce((sum, e) => sum + e.amount, 0);
  const sorted = [...byCategory]
    .map(([category, e]) => ({ category, categories: [category], ...e }))
    .sort((a, b) => b.amount - a.amount);

  // Folding a single category would only rename it, so "Other" needs at least two.
  const shown = sorted.length > MAX_CATEGORIES + 1 ? sorted.slice(0, MAX_CATEGORIES) : sorted;
  const rest = sorted.slice(shown.length);
  const rows: Omit<CategoryShare, 'share'>[] = rest.length
    ? [
        ...shown,
        {
          category: null,
          categories: rest.map((e) => e.category),
          amount: rest.reduce((sum, e) => sum + e.amount, 0),
          count: rest.reduce((sum, e) => sum + e.count, 0),
        },
      ]
    : shown;
  return rows.map((row) => ({
    ...row,
    amount: round(row.amount),
    share: total ? row.amount / total : 0,
  }));
}

/** Transactions grouped by day, newest day first (the list comes sorted from the server). */
export function groupByDay(transactions: Transaction[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const t of transactions) {
    let group = groups.at(-1);
    if (group?.day !== t.occurredOn) {
      group = { day: t.occurredOn, transactions: [], totals: [] };
      groups.push(group);
    }
    group.transactions.push(t);
    let total = group.totals.find((x) => x.currency === t.currency);
    if (!total) {
      total = { currency: t.currency, net: 0 };
      group.totals.push(total);
    }
    total.net = round(total.net + (t.kind === 'income' ? t.amount : -t.amount));
  }
  return groups;
}

/** Relative change, e.g. 0.12 for +12%; null when there is nothing to compare with. */
export function relativeChange(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
