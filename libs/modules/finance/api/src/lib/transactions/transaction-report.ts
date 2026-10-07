import { Transaction, TransactionKind } from '@pd/contracts';

/** What narrows a list of transactions for the assistant. */
export interface TransactionFilter {
  kind?: TransactionKind;
  /** The category, whatever the case. */
  category?: string;
  /** A part of the comment or of the category ("zabka", "taxi"). */
  search?: string;
}

/** Letters as typed on any keyboard: "Żabka" is found by "zabka". */
const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ł/gi, 'l')
    .toLowerCase();

export function filterTransactions<T extends Pick<Transaction, 'kind' | 'category' | 'note'>>(
  transactions: T[],
  { kind, category, search }: TransactionFilter,
): T[] {
  const wanted = category && plain(category.trim());
  const part = search && plain(search.trim());
  return transactions.filter(
    (t) =>
      (!kind || t.kind === kind) &&
      (!wanted || plain(t.category) === wanted) &&
      (!part || plain(t.note ?? '').includes(part) || plain(t.category).includes(part)),
  );
}

export interface CategoryTotal {
  kind: TransactionKind;
  category: string;
  count: number;
  /** In the main currency; transactions without a rate are left out (see `unconverted`). */
  mainAmount: number;
  /** As recorded, per currency. */
  amounts: Record<string, number>;
  /** How many of them have no rate to the main currency. */
  unconverted: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Every category with what went through it — all of them, the largest first. */
export function totalsByCategory(
  transactions: Pick<Transaction, 'kind' | 'category' | 'amount' | 'currency' | 'mainAmount'>[],
): CategoryTotal[] {
  const totals = new Map<string, CategoryTotal>();
  for (const t of transactions) {
    const key = `${t.kind}:${t.category}`;
    const total = totals.get(key) ?? {
      kind: t.kind,
      category: t.category,
      count: 0,
      mainAmount: 0,
      amounts: {},
      unconverted: 0,
    };
    total.count += 1;
    total.amounts[t.currency] = round((total.amounts[t.currency] ?? 0) + t.amount);
    if (t.mainAmount === null) {
      total.unconverted += 1;
    } else {
      total.mainAmount = round(total.mainAmount + t.mainAmount);
    }
    totals.set(key, total);
  }
  return [...totals.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || b.mainAmount - a.mainAmount,
  );
}
