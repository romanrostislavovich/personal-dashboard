import { Inject, Injectable } from '@nestjs/common';
import { AiService, DB, Database } from '@pd/api-core';
import { FinanceReport } from '@pd/contracts';
import { and, eq } from 'drizzle-orm';
import { round } from '../currency/conversion';
import { BudgetsService, monthRange } from '../budgets/budgets.service';
import { financeReports } from '../finance.schema';
import { SubscriptionsService } from '../recurring/subscriptions.service';
import { TransactionsService } from '../transactions/transactions.service';

/** The months before the reported one its spending is compared with. */
const HISTORY_MONTHS = 3;
const LARGEST = 5;

const INSTRUCTION =
  "You get the user's finances of one month as JSON, all amounts in their main currency: " +
  'income and expenses, spending per category this month, last month and on average over the ' +
  'months before, budgets, subscriptions and the largest expenses. Write a review of the month. ' +
  'The FIRST line is a one or two sentence summary on its own. Then an empty line, then the ' +
  'review in Markdown with three short sections: where the money went, what changed compared ' +
  'with the months before (only real changes, with numbers), and two or three concrete ways to ' +
  'save based on these numbers. No generic advice, no tables, at most ~200 words.';

/**
 * The AI's review of a month of finances, kept once written: shown in Finance and, in short,
 * in the summary of the month on the 1st.
 */
@Injectable()
export class FinanceReportsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly ai: AiService,
    private readonly transactions: TransactionsService,
    private readonly budgets: BudgetsService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async get(userId: string, month: string): Promise<FinanceReport | null> {
    const [row] = await this.db
      .select()
      .from(financeReports)
      .where(and(eq(financeReports.userId, userId), eq(financeReports.month, month)));
    return row ? toReport(row) : null;
  }

  /** Writes (or writes again) the review of a month; `null` — nothing was spent or earned. */
  async generate(userId: string, month: string): Promise<FinanceReport | null> {
    const facts = await this.facts(userId, month);
    if (!facts) {
      return null;
    }
    const reply = (await this.ai.complete(userId, INSTRUCTION, JSON.stringify(facts), 'finance'))
      .replace(/\r/g, '')
      .trim();
    const split = reply.indexOf('\n\n');
    const summary = (split > 0 ? reply.slice(0, split) : reply).replace(/^#+\s*/, '').trim();
    const text = split > 0 ? reply.slice(split + 2).trim() : reply;
    const [row] = await this.db
      .insert(financeReports)
      .values({ userId, month, summary, text })
      .onConflictDoUpdate({
        target: [financeReports.userId, financeReports.month],
        set: { summary, text, createdAt: new Date() },
      })
      .returning();
    return toReport(row);
  }

  /**
   * The short version for the summary of a month: written now if there is none, or if the one
   * there was written before the month ended.
   */
  async summaryOf(userId: string, month: string): Promise<string | null> {
    if (!(await this.ai.canSee(userId, 'finance')) || !(await this.ai.isConfigured(userId))) {
      return null;
    }
    const existing = await this.get(userId, month);
    const ended = `${monthRange(month).to}T23:59:59Z`;
    const report =
      existing && existing.createdAt > ended ? existing : await this.generate(userId, month);
    return report?.summary ?? null;
  }

  private async facts(userId: string, month: string) {
    const range = monthRange(month);
    const summary = await this.transactions.summary(userId, range);
    if (!summary.inMain) {
      return null;
    }
    const previous = shift(month, -1);
    const history = Array.from({ length: HISTORY_MONTHS }, (_, index) => shift(month, -2 - index));
    const [current, last, ...before] = await Promise.all(
      [month, previous, ...history].map((key) =>
        this.transactions.expensesInMain(userId, monthRange(key)),
      ),
    );
    const average = new Map<string, number>();
    for (const { byCategory } of before) {
      for (const [category, value] of byCategory) {
        average.set(category, (average.get(category) ?? 0) + value / HISTORY_MONTHS);
      }
    }
    const largest = (await this.transactions.list(userId, range))
      .filter((t) => t.kind === 'expense' && t.mainAmount !== null)
      .sort((a, b) => (b.mainAmount ?? 0) - (a.mainAmount ?? 0))
      .slice(0, LARGEST)
      .map((t) => ({
        amount: t.mainAmount,
        category: t.category,
        note: t.note,
        day: t.occurredOn,
      }));
    const subscriptions = await this.subscriptions.summary(userId);
    return {
      month,
      currency: summary.inMain.mainCurrency,
      income: summary.inMain.income,
      expenses: summary.inMain.expense,
      byCategory: rounded(current.byCategory),
      lastMonthByCategory: rounded(last.byCategory),
      averageBeforeByCategory: rounded(average),
      budgets: (await this.budgets.list(userId, month)).map(({ category, limit, spent }) => ({
        category,
        limit,
        spent,
      })),
      subscriptionsPerMonth: subscriptions.perMonth,
      largestExpenses: largest,
    };
  }
}

function rounded(values: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...values].sort((a, b) => b[1] - a[1]).map(([key, value]) => [key, round(value)]),
  );
}

/** `YYYY-MM` moved by a number of months. */
function shift(month: string, by: number): string {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1 + by, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function toReport(row: typeof financeReports.$inferSelect): FinanceReport {
  return {
    month: row.month,
    summary: row.summary,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  };
}
