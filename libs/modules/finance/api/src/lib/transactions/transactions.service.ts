import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, Database, ProjectsService } from '@pd/api-core';
import {
  FinanceSummary,
  MonthCashFlow,
  Transaction,
  TransactionInput,
  TransactionQuery,
} from '@pd/contracts';
import { and, asc, desc, eq, gte, isNull, lte, sql, SQL, sum } from 'drizzle-orm';
import { TransactionRow, transactions } from '../finance.schema';

const TOP_CATEGORIES_LIMIT = 5;

@Injectable()
export class TransactionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly projects: ProjectsService,
  ) {}

  async list(userId: string, query: TransactionQuery): Promise<Transaction[]> {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(this.filter(userId, query))
      .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt));
    return rows.map(toTransaction);
  }

  async get(userId: string, id: string): Promise<Transaction> {
    const [row] = await this.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
    if (!row) {
      throw new NotFoundException('Transaction not found');
    }
    return toTransaction(row);
  }

  async create(userId: string, input: TransactionInput): Promise<Transaction> {
    if (input.projectId) {
      await this.projects.assertOwned(userId, input.projectId);
    }
    const [row] = await this.db
      .insert(transactions)
      .values({ userId, ...input })
      .returning();
    return toTransaction(row);
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
    return rows.map(toTransaction);
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
    return toTransaction(row);
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

  private filter(userId: string, { from, to, scope }: TransactionQuery): SQL | undefined {
    return and(
      eq(transactions.userId, userId),
      gte(transactions.occurredOn, from),
      lte(transactions.occurredOn, to),
      scope === 'personal' ? isNull(transactions.projectId) : undefined,
      scope && scope !== 'personal' ? eq(transactions.projectId, scope) : undefined,
    );
  }
}

function toTransaction(row: TransactionRow): Transaction {
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
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
