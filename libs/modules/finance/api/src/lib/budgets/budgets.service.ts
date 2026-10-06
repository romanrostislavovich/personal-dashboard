import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AutomationsService, DB, Database, NotificationsService, UsersService } from '@pd/api-core';
import { Budget, BudgetInput, zonedDateTime } from '@pd/contracts';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { financeMessages } from '../finance.messages';
import { financeBudgets } from '../finance.schema';
import { TransactionsService } from '../transactions/transactions.service';
import { budgetAlerts, spentOf } from './budget-rules';

/**
 * Monthly limits of categories (or of all expenses), in the main currency. Every change of a
 * transaction checks them: past 80% and past 100% of a limit the user is told, once a month each.
 */
@Injectable()
export class BudgetsService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly transactions: TransactionsService,
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
    private readonly automations: AutomationsService,
  ) {}

  onModuleInit(): void {
    // Any new, changed or imported transaction (by hand, the AI, a receipt) may cross a limit.
    this.transactions.onChange((userId) => this.check(userId));
  }

  /** The budgets with what was spent in the month (`YYYY-MM`). */
  async list(userId: string, month: string): Promise<Budget[]> {
    const budgets = await this.rows(userId);
    if (!budgets.length) {
      return [];
    }
    const { mainCurrency, byCategory } = await this.transactions.expensesInMain(
      userId,
      monthRange(month),
    );
    return budgets.map((budget) => ({
      id: budget.id,
      category: budget.category,
      limit: budget.limit,
      spent: round(spentOf(budget, byCategory)),
      currency: mainCurrency,
    }));
  }

  /** The whole set at once; a budget that stays keeps what it was told this month. */
  async save(userId: string, inputs: BudgetInput[]): Promise<void> {
    const unique = [
      ...new Map(inputs.map((input) => [input.category.toLowerCase(), input])).values(),
    ];
    await this.db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(financeBudgets)
        .where(eq(financeBudgets.userId, userId));
      const kept = new Set(unique.map((input) => input.category.toLowerCase()));
      const gone = existing
        .filter((row) => !kept.has(row.category.toLowerCase()))
        .map((row) => row.id);
      if (gone.length) {
        await tx.delete(financeBudgets).where(inArray(financeBudgets.id, gone));
      }
      for (const input of unique) {
        const row = existing.find(
          (candidate) => candidate.category.toLowerCase() === input.category.toLowerCase(),
        );
        if (row) {
          await tx
            .update(financeBudgets)
            .set({ limit: input.limit })
            .where(eq(financeBudgets.id, row.id));
        } else {
          await tx.insert(financeBudgets).values({ userId, ...input });
        }
      }
    });
    await this.check(userId);
  }

  /** Tells about the budgets of this month past 80% or 100% of their limit, once each. */
  async check(userId: string): Promise<void> {
    const budgets = await this.rows(userId);
    if (!budgets.length) {
      return;
    }
    const user = await this.users.findById(userId);
    const month = zonedDateTime(new Date(), this.users.timeZoneOf(user)).date.slice(0, 7);
    const { mainCurrency, byCategory } = await this.transactions.expensesInMain(
      userId,
      monthRange(month),
    );
    const text = financeMessages(user?.locale ?? 'en');
    for (const alert of budgetAlerts(budgets, byCategory, month)) {
      const name = alert.budget.category === '*' ? text.budgetTotal : alert.budget.category;
      await this.notifications.send(userId, {
        title:
          alert.level === 'exceeded' ? text.budgetExceededTitle(name) : text.budgetWarnTitle(name),
        body: text.budgetBody(round(alert.spent), alert.budget.limit, mainCurrency),
        source: 'finance',
      });
      await this.automations.emit(userId, 'finance.budget', {
        level: alert.level,
        category: name,
        spent: round(alert.spent).toFixed(2),
        limit: alert.budget.limit.toFixed(2),
        currency: mainCurrency,
      });
      await this.db
        .update(financeBudgets)
        .set(alert.level === 'exceeded' ? { exceededMonth: month } : { warnedMonth: month })
        .where(and(eq(financeBudgets.id, alert.budget.id), eq(financeBudgets.userId, userId)));
    }
  }

  private rows(userId: string) {
    return this.db
      .select()
      .from(financeBudgets)
      .where(eq(financeBudgets.userId, userId))
      .orderBy(asc(financeBudgets.category));
  }
}

/** The first and the last day of a month (`YYYY-MM`). */
export function monthRange(month: string): { from: string; to: string } {
  const [year, number] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
