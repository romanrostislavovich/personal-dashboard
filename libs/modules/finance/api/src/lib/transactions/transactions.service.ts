import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, Database, ProjectsService } from '@pd/api-core';
import {
  FinanceSummary,
  MainCashFlow,
  MainCurrencyTotals,
  MonthCashFlow,
  Transaction,
  TransactionInput,
  TransactionQuery,
} from '@pd/contracts';
import { and, asc, desc, eq, gte, isNull, lte, sql, SQL, sum } from 'drizzle-orm';
import { Converted, round } from '../currency/conversion';
import { ExchangeRatesService } from '../currency/exchange-rates.service';
import { FinanceSettingsService } from '../currency/finance-settings.service';
import { TransactionRow, transactions } from '../finance.schema';

const TOP_CATEGORIES_LIMIT = 5;

@Injectable()
export class TransactionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly projects: ProjectsService,
    private readonly rates: ExchangeRatesService,
    private readonly settings: FinanceSettingsService,
  ) {}

  private readonly listeners: ((userId: string) => Promise<void>)[] = [];

  /** Called after transactions of a user were created or changed (budgets check themselves). */
  onChange(listener: (userId: string) => Promise<void>): void {
    this.listeners.push(listener);
  }

  /** Expenses of a period per category, in the main currency (each at the rate of its day). */
  async expensesInMain(
    userId: string,
    period: { from: string; to: string },
  ): Promise<{ mainCurrency: string; byCategory: Map<string, number> }> {
    const rows = await this.db
      .select({
        amount: transactions.amount,
        currency: transactions.currency,
        category: transactions.category,
        day: transactions.occurredOn,
      })
      .from(transactions)
      .where(and(this.filter(userId, period), eq(transactions.kind, 'expense')));
    const main = await this.settings.mainCurrency(userId);
    const { values } = await this.convert(
      rows,
      main,
      (r) => r.amount,
      (r) => r.day,
    );
    const byCategory = new Map<string, number>();
    rows.forEach((row, index) =>
      byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + (values[index] ?? 0)),
    );
    return { mainCurrency: main, byCategory };
  }

  private changed(userId: string): void {
    for (const listener of this.listeners) {
      // A failing listener (a notification) must not fail the transaction that was saved.
      void listener(userId).catch(() => undefined);
    }
  }

  async list(userId: string, query: TransactionQuery): Promise<Transaction[]> {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(this.filter(userId, query))
      .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt));
    return this.withMainAmounts(userId, rows);
  }

  async get(userId: string, id: string): Promise<Transaction> {
    const [row] = await this.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
    if (!row) {
      throw new NotFoundException('Transaction not found');
    }
    const [transaction] = await this.withMainAmounts(userId, [row]);
    return transaction;
  }

  async create(userId: string, input: TransactionInput): Promise<Transaction> {
    if (input.projectId) {
      await this.projects.assertOwned(userId, input.projectId);
    }
    const [row] = await this.db
      .insert(transactions)
      .values({ userId, ...input })
      .returning();
    const [transaction] = await this.withMainAmounts(userId, [row]);
    this.changed(userId);
    return transaction;
  }

  /** Several transactions at once (an imported bank statement): all are saved or none. */
  async createMany(userId: string, inputs: TransactionInput[]): Promise<Transaction[]> {
    const projectIds = new Set(inputs.map((input) => input.projectId).filter((id) => id != null));
    for (const projectId of projectIds) {
      await this.projects.assertOwned(userId, projectId);
    }
    if (inputs.length === 0) {
      return [];
    }
    const rows = await this.db
      .insert(transactions)
      .values(inputs.map((input) => ({ userId, ...input })))
      .returning();
    this.changed(userId);
    return this.withMainAmounts(userId, rows);
  }

  async update(userId: string, id: string, input: TransactionInput): Promise<Transaction> {
    if (input.projectId) {
      await this.projects.assertOwned(userId, input.projectId);
    }
    const [row] = await this.db
      .update(transactions)
      .set(input)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .returning();
    if (!row) {
      throw new NotFoundException();
    }
    const [transaction] = await this.withMainAmounts(userId, [row]);
    this.changed(userId);
    return transaction;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.db
      .delete(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
  }

  /** Income/expenses by currency and top expense categories for a period. */
  async summary(userId: string, query: TransactionQuery): Promise<FinanceSummary> {
    const where = this.filter(userId, query);
    const total = sum(transactions.amount).mapWith(Number);

    const byKind = await this.db
      .select({ currency: transactions.currency, kind: transactions.kind, total })
      .from(transactions)
      .where(where)
      .groupBy(transactions.currency, transactions.kind);

    const topCategories = await this.db
      .select({ category: transactions.category, currency: transactions.currency, expense: total })
      .from(transactions)
      .where(and(where, eq(transactions.kind, 'expense')))
      .groupBy(transactions.category, transactions.currency)
      .orderBy(desc(total))
      .limit(TOP_CATEGORIES_LIMIT);

    const currencies = [...new Set(byKind.map((row) => row.currency))].sort();
    const totalFor = (currency: string, kind: string) =>
      byKind.find((row) => row.currency === currency && row.kind === kind)?.total ?? 0;

    return {
      from: query.from,
      to: query.to,
      totals: currencies.map((currency) => {
        const income = totalFor(currency, 'income');
        const expense = totalFor(currency, 'expense');
        return { currency, income, expense, balance: round(income - expense) };
      }),
      topExpenseCategories: topCategories,
      inMain: await this.totalsInMain(userId, query),
    };
  }

  /** Income and expenses per month and currency, oldest month first. */
  async cashFlow(userId: string, query: TransactionQuery): Promise<MonthCashFlow[]> {
    const month = sql<string>`to_char(${transactions.occurredOn}, 'YYYY-MM')`;
    const rows = await this.db
      .select({
        month,
        currency: transactions.currency,
        kind: transactions.kind,
        total: sum(transactions.amount).mapWith(Number),
      })
      .from(transactions)
      .where(this.filter(userId, query))
      .groupBy(month, transactions.currency, transactions.kind)
      .orderBy(asc(month));

    const byMonth = new Map<string, MonthCashFlow>();
    for (const { month, currency, kind, total } of rows) {
      const key = `${month} ${currency}`;
      const entry = byMonth.get(key) ?? { month, currency, income: 0, expense: 0 };
      entry[kind] = round(total);
      byMonth.set(key, entry);
    }
    return [...byMonth.values()];
  }

  /** Months in the main currency: each transaction at the rate of its day. */
  async cashFlowInMain(userId: string, query: TransactionQuery): Promise<MainCashFlow> {
    const month = sql<string>`to_char(${transactions.occurredOn}, 'YYYY-MM')`;
    // Summed per day and currency first: one rate per group instead of one per transaction.
    const groups = await this.db
      .select({
        month,
        day: transactions.occurredOn,
        currency: transactions.currency,
        kind: transactions.kind,
        total: sum(transactions.amount).mapWith(Number),
      })
      .from(transactions)
      .where(this.filter(userId, query))
      .groupBy(month, transactions.occurredOn, transactions.currency, transactions.kind);
    const main = await this.settings.mainCurrency(userId);
    const converted = await this.convert(
      groups,
      main,
      (g) => g.total,
      (g) => g.day,
    );
    const byMonth = new Map<string, { month: string; income: number; expense: number }>();
    groups.forEach((group, index) => {
      const entry = byMonth.get(group.month) ?? { month: group.month, income: 0, expense: 0 };
      entry[group.kind] = round(entry[group.kind] + (converted.values[index] ?? 0));
      byMonth.set(group.month, entry);
    });
    const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
    return {
      mainCurrency: main,
      approximate: converted.approximate,
      missing: converted.missing,
      months,
    };
  }

  private async totalsInMain(
    userId: string,
    query: TransactionQuery,
  ): Promise<MainCurrencyTotals | null> {
    const rows = await this.db
      .select({
        kind: transactions.kind,
        amount: transactions.amount,
        currency: transactions.currency,
        category: transactions.category,
        day: transactions.occurredOn,
      })
      .from(transactions)
      .where(this.filter(userId, query));
    if (rows.length === 0) {
      return null;
    }
    const main = await this.settings.mainCurrency(userId);
    const { values, approximate, missing } = await this.convert(
      rows,
      main,
      (r) => r.amount,
      (r) => r.day,
    );
    let income = 0;
    let expense = 0;
    const categories = new Map<string, number>();
    rows.forEach((row, index) => {
      const value = values[index] ?? 0;
      if (row.kind === 'income') {
        income += value;
      } else {
        expense += value;
        categories.set(row.category, (categories.get(row.category) ?? 0) + value);
      }
    });
    const topExpenseCategories = [...categories]
      .map(([category, total]) => ({ category, expense: round(total) }))
      .sort((a, b) => b.expense - a.expense)
      .slice(0, TOP_CATEGORIES_LIMIT);
    return {
      mainCurrency: main,
      approximate,
      missing,
      income: round(income),
      expense: round(expense),
      balance: round(income - expense),
      topExpenseCategories,
    };
  }

  private async withMainAmounts(userId: string, rows: TransactionRow[]): Promise<Transaction[]> {
    if (rows.length === 0) {
      return [];
    }
    const main = await this.settings.mainCurrency(userId);
    const { values } = await this.convert(
      rows,
      main,
      (r) => r.amount,
      (r) => r.occurredOn,
    );
    return rows.map((row, index) => toTransaction(row, values[index]));
  }

  private convert<T extends { currency: string }>(
    items: T[],
    main: string,
    amount: (item: T) => number,
    day: (item: T) => string,
  ): Promise<Converted> {
    return this.rates.convert(
      items.map((item) => ({ amount: amount(item), currency: item.currency, day: day(item) })),
      main,
    );
  }

  private filter(
    userId: string,
    {
      from,
      to,
      scope,
    }: Pick<TransactionQuery, 'from' | 'to'> & { scope?: TransactionQuery['scope'] },
  ): SQL | undefined {
    return and(
      eq(transactions.userId, userId),
      gte(transactions.occurredOn, from),
      lte(transactions.occurredOn, to),
      scope === 'personal' ? isNull(transactions.projectId) : undefined,
      scope && scope !== 'personal' ? eq(transactions.projectId, scope) : undefined,
    );
  }
}

function toTransaction(row: TransactionRow, mainAmount: number | null): Transaction {
  return {
    id: row.id,
    kind: row.kind,
    amount: row.amount,
    currency: row.currency,
    category: row.category,
    note: row.note,
    occurredOn: row.occurredOn,
    projectId: row.projectId,
    recurringPaymentId: row.recurringPaymentId,
    costSourceId: row.costSourceId,
    mainAmount,
  };
}
