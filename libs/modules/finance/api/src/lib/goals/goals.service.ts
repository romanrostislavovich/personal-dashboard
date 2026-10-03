import { Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { DB, Database, NotificationsService, ProjectsService, UsersService } from '@pd/api-core';
import {
  GOAL_WALLET_PERSONAL,
  GoalContribution,
  SavingsGoal,
  savingsGoalInputSchema,
  toLocalDate,
} from '@pd/contracts';
import { and, asc, desc, eq, gte, isNull, lte, sum } from 'drizzle-orm';
import { z } from 'zod';
import { round } from '../currency/conversion';
import { ExchangeRatesService } from '../currency/exchange-rates.service';
import { financeMessages } from '../finance.messages';
import { goalContributions, SavingsGoalRow, savingsGoals, transactions } from '../finance.schema';
import { RecurringPaymentsService } from '../recurring/recurring-payments.service';
import { TransactionsService } from '../transactions/transactions.service';
import { goalPace } from './goal-math';

type ValidGoalInput = z.output<typeof savingsGoalInputSchema>;

export interface GoalContributionRow {
  id: string;
  amount: number;
  note: string | null;
  occurredOn: string;
}

/**
 * Saving up for something. The money of a goal is what is left in its wallet since the goal
 * started (income minus expenses, in the goal's currency at each day's rate) plus what is added
 * by hand. Reaching the target is reported once.
 */
@Injectable()
export class GoalsService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly projects: ProjectsService,
    private readonly rates: ExchangeRatesService,
    private readonly recurring: RecurringPaymentsService,
    private readonly transactions: TransactionsService,
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.transactions.onChange((userId) => this.checkReached(userId));
  }

  async list(userId: string): Promise<SavingsGoal[]> {
    const rows = await this.db
      .select()
      .from(savingsGoals)
      .where(eq(savingsGoals.userId, userId))
      .orderBy(asc(savingsGoals.createdAt));
    return Promise.all(rows.map((row) => this.withProgress(row)));
  }

  async create(userId: string, input: ValidGoalInput): Promise<SavingsGoal> {
    await this.assertWallet(userId, input.wallet);
    const [row] = await this.db
      .insert(savingsGoals)
      .values({ userId, ...input, deadline: input.deadline ?? null, wallet: input.wallet ?? null })
      .returning();
    return this.withProgress(row);
  }

  async update(userId: string, id: string, input: ValidGoalInput): Promise<SavingsGoal> {
    await this.assertWallet(userId, input.wallet);
    const [row] = await this.db
      .update(savingsGoals)
      .set({ ...input, deadline: input.deadline ?? null, wallet: input.wallet ?? null })
      .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))
      .returning();
    if (!row) {
      throw new NotFoundException();
    }
    await this.checkReached(userId);
    return this.withProgress(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.db
      .delete(savingsGoals)
      .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)));
  }

  async contributions(userId: string, goalId: string): Promise<GoalContributionRow[]> {
    await this.row(userId, goalId);
    return this.db
      .select({
        id: goalContributions.id,
        amount: goalContributions.amount,
        note: goalContributions.note,
        occurredOn: goalContributions.occurredOn,
      })
      .from(goalContributions)
      .where(and(eq(goalContributions.goalId, goalId), eq(goalContributions.userId, userId)))
      .orderBy(desc(goalContributions.occurredOn), desc(goalContributions.createdAt));
  }

  async contribute(userId: string, goalId: string, input: GoalContribution): Promise<SavingsGoal> {
    const goal = await this.row(userId, goalId);
    await this.db
      .insert(goalContributions)
      .values({ userId, goalId, ...input, note: input.note || null });
    await this.checkReached(userId);
    return this.withProgress(goal);
  }

  async removeContribution(userId: string, goalId: string, id: string): Promise<void> {
    await this.db
      .delete(goalContributions)
      .where(
        and(
          eq(goalContributions.id, id),
          eq(goalContributions.goalId, goalId),
          eq(goalContributions.userId, userId),
        ),
      );
  }

  /** Tells once that a goal is reached. */
  async checkReached(userId: string): Promise<void> {
    const open = await this.db
      .select()
      .from(savingsGoals)
      .where(and(eq(savingsGoals.userId, userId), isNull(savingsGoals.reachedAt)));
    for (const row of open) {
      const goal = await this.withProgress(row);
      if (goal.saved < goal.target) {
        continue;
      }
      await this.db
        .update(savingsGoals)
        .set({ reachedAt: new Date() })
        .where(eq(savingsGoals.id, row.id));
      const text = financeMessages((await this.users.findById(userId))?.locale ?? 'en');
      await this.notifications.send(userId, {
        title: text.goalReachedTitle(goal.name),
        body: text.goalReachedBody(goal.saved, goal.currency),
        source: 'finance',
      });
    }
  }

  private async withProgress(row: SavingsGoalRow): Promise<SavingsGoal> {
    const today = toLocalDate(this.recurring.today());
    const [{ added }] = await this.db
      .select({ added: sum(goalContributions.amount).mapWith(Number) })
      .from(goalContributions)
      .where(eq(goalContributions.goalId, row.id));
    const fromWallet = await this.walletBalance(row, today);
    const saved = round(fromWallet + (added ?? 0));
    return {
      id: row.id,
      name: row.name,
      target: row.target,
      currency: row.currency,
      deadline: row.deadline,
      wallet: row.wallet,
      startedOn: row.startedOn,
      saved,
      fromWallet,
      added: round(added ?? 0),
      ...goalPace(row, saved, today),
      reachedAt: row.reachedAt?.toISOString() ?? null,
    };
  }

  /** Income minus expenses of the goal's wallet since it started, in the goal's currency. */
  private async walletBalance(row: SavingsGoalRow, today: string): Promise<number> {
    if (!row.wallet || row.startedOn > today) {
      return 0;
    }
    const rows = await this.db
      .select({
        kind: transactions.kind,
        amount: transactions.amount,
        currency: transactions.currency,
        day: transactions.occurredOn,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, row.userId),
          row.wallet === GOAL_WALLET_PERSONAL
            ? isNull(transactions.projectId)
            : eq(transactions.projectId, row.wallet),
          gte(transactions.occurredOn, row.startedOn),
          lte(transactions.occurredOn, today),
        ),
      );
    if (!rows.length) {
      return 0;
    }
    const { values } = await this.rates.convert(rows, row.currency);
    return round(
      rows.reduce(
        (total, item, index) => total + (item.kind === 'income' ? 1 : -1) * (values[index] ?? 0),
        0,
      ),
    );
  }

  private async row(userId: string, id: string): Promise<SavingsGoalRow> {
    const [row] = await this.db
      .select()
      .from(savingsGoals)
      .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)));
    if (!row) {
      throw new NotFoundException();
    }
    return row;
  }

  private async assertWallet(userId: string, wallet: string | null | undefined): Promise<void> {
    if (wallet && wallet !== GOAL_WALLET_PERSONAL) {
      await this.projects.assertOwned(userId, wallet);
    }
  }
}
