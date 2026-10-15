import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { achievementTier, achievementTiers, AchievementsService, DB, Database } from '@pd/api-core';
import { and, count, eq, isNotNull, SQL, sql } from 'drizzle-orm';
import { BudgetsService } from './budgets/budgets.service';
import {
  costSources,
  financeReceipts,
  recurringPayments,
  savingsGoals,
  transactions,
  wishes,
} from './finance.schema';
import { SubscriptionsService } from './recurring/subscriptions.service';
import { TransactionsService } from './transactions/transactions.service';

/** How far back the budgets are checked month by month. */
const BUDGET_MONTHS_BACK = 12;

/**
 * Finance achievements: keeping the records, and the habits they show — months within the
 * budgets, months with more coming in than going out, savings goals reached.
 */
@Injectable()
export class FinanceAchievements implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly budgets: BudgetsService,
    private readonly transactionsService: TransactionsService,
  ) {}

  onModuleInit(): void {
    this.registerTracking();
    this.registerAutomation();
    this.registerWishlist();
    this.registerSubscriptionUse();
    this.registerHabits();
  }

  /** Good habits the records show, not how many there are. */
  private registerHabits(): void {
    this.achievements.register({
      id: 'finance.budget-months',
      module: 'finance',
      measure: (userId) => this.monthsWithinBudgets(userId),
      tiers: achievementTiers(
        [
          1,
          '🎯',
          { en: 'Within the budget', ru: 'В рамках бюджета' },
          {
            en: 'A whole month without going over any budget',
            ru: 'Целый месяц без превышения бюджетов',
          },
        ],
        [
          3,
          '📏',
          { en: 'Disciplined', ru: 'Дисциплина' },
          {
            en: '3 months in a row without going over any budget',
            ru: '3 месяца подряд без превышения бюджетов',
          },
        ],
        [
          12,
          '🏦',
          { en: 'A year on budget', ru: 'Год по бюджету' },
          {
            en: '12 months in a row without going over any budget',
            ru: '12 месяцев подряд без превышения бюджетов',
          },
        ],
      ),
    });

    this.achievements.register({
      id: 'finance.positive-months',
      module: 'finance',
      measure: (userId) => this.positiveMonths(userId),
      tiers: achievementTiers(
        [
          3,
          '📈',
          { en: 'In the black', ru: 'В плюсе' },
          {
            en: '3 months in a row with more income than expenses',
            ru: '3 месяца подряд доходы больше расходов',
          },
        ],
        [
          6,
          '💹',
          { en: 'Half a year in the black', ru: 'Полгода в плюсе' },
          {
            en: '6 months in a row with more income than expenses',
            ru: '6 месяцев подряд доходы больше расходов',
          },
        ],
        [
          12,
          '🏛️',
          { en: 'A year in the black', ru: 'Год в плюсе' },
          {
            en: '12 months in a row with more income than expenses',
            ru: '12 месяцев подряд доходы больше расходов',
          },
        ],
      ),
    });

    this.achievements.register({
      id: 'finance.goals-reached',
      module: 'finance',
      measure: async (userId) => {
        const [row] = await this.db
          .select({ value: count() })
          .from(savingsGoals)
          .where(and(eq(savingsGoals.userId, userId), isNotNull(savingsGoals.reachedAt)));
        return row?.value ?? 0;
      },
      tiers: achievementTiers(
        [
          1,
          '🐷',
          { en: 'Piggy bank full', ru: 'Копилка полна' },
          { en: 'A savings goal reached', ru: 'Цель накоплений достигнута' },
        ],
        [
          3,
          '💰',
          { en: 'Saver', ru: 'Накопитель' },
          { en: 'Three savings goals reached', ru: 'Три цели накоплений достигнуты' },
        ],
      ),
    });

    this.achievements.register({
      id: 'finance.receipts',
      module: 'finance',
      measure: async (userId) => {
        const [row] = await this.db
          .select({ value: count() })
          .from(financeReceipts)
          .where(eq(financeReceipts.userId, userId));
        return row?.value ?? 0;
      },
      tiers: achievementTiers(
        [
          1,
          '📸',
          { en: 'Snap the receipt', ru: 'Щёлк — и чек' },
          {
            en: 'A photo of a receipt became an expense',
            ru: 'Фото чека превратилось в расход',
          },
        ],
        [
          10,
          '🧾',
          { en: 'Receipt collector', ru: 'Собиратель чеков' },
          { en: '10 receipts read from photos', ru: '10 чеков прочитано с фото' },
        ],
        [
          50,
          '🗃️',
          { en: 'Paperless', ru: 'Без бумажек' },
          { en: '50 receipts read from photos', ru: '50 чеков прочитано с фото' },
        ],
      ),
    });
  }

  /**
   * Paying only for what is used: the other sections tell the use of a subscription (music —
   * the plays, activity — the time in the program). Counts the used ones, and nothing while
   * one is paid for and not used.
   */
  private registerSubscriptionUse(): void {
    this.achievements.register({
      id: 'finance.subscriptions-used',
      module: 'finance',
      measure: async (userId) => {
        const { usage } = await this.subscriptions.summary(userId);
        return usage.some((item) => item.unused) ? 0 : usage.length;
      },
      tiers: [
        achievementTier(
          2,
          '♻️',
          { en: 'Nothing wasted', ru: 'Ничего зря' },
          {
            en: 'Two or more subscriptions whose use is known, and every one of them was used in the last 30 days',
            ru: 'Две и больше подписок, использование которых известно, — и каждой пользовались за последние 30 дней',
          },
        ),
      ],
    });
  }

  /** Keeping records: months with transactions and their number. */
  private registerTracking(): void {
    this.achievements.register({
      id: 'finance.months-tracked',
      module: 'finance',
      measure: (userId) => this.monthsWithTransactions(userId),
      tiers: [
        achievementTier(
          1,
          '🧾',
          { en: 'First month tracked', ru: 'Первый месяц учёта' },
          { en: 'Transactions in at least 1 month', ru: 'Операции хотя бы за 1 месяц' },
        ),
        achievementTier(
          3,
          '📊',
          { en: 'Counting habit', ru: 'Привычка считать' },
          { en: 'Transactions in 3 different months', ru: 'Операции за 3 разных месяца' },
        ),
        achievementTier(
          12,
          '🗓️',
          { en: 'A year of tracking', ru: 'Год учёта' },
          { en: 'Transactions in 12 different months', ru: 'Операции за 12 разных месяцев' },
        ),
      ],
    });

    this.achievements.register({
      id: 'finance.transactions',
      module: 'finance',
      measure: (userId) => this.count(transactions, eq(transactions.userId, userId)),
      tiers: achievementTiers(
        [
          50,
          '📒',
          { en: 'Bookkeeper', ru: 'Бухгалтер' },
          { en: '50 transactions recorded', ru: '50 записанных операций' },
        ],
        [
          500,
          '🧾',
          { en: 'Accountant', ru: 'Счетовод' },
          { en: '500 transactions recorded', ru: '500 записанных операций' },
        ],
        [
          2000,
          '📚',
          { en: 'Chief accountant', ru: 'Главбух' },
          { en: '2,000 transactions recorded', ru: '2 000 записанных операций' },
        ],
      ),
    });
  }

  /** Recurring payments and automatic cost import. */
  private registerAutomation(): void {
    this.achievements.register({
      id: 'finance.recurring',
      module: 'finance',
      measure: (userId) =>
        this.count(
          recurringPayments,
          and(eq(recurringPayments.userId, userId), eq(recurringPayments.isActive, true)),
        ),
      tiers: achievementTiers([
        3,
        '🔁',
        { en: 'On autopilot', ru: 'На автопилоте' },
        { en: '3 active recurring payments', ru: '3 активных регулярных платежа' },
      ]),
    });
    this.achievements.register({
      id: 'finance.cost-sources',
      module: 'finance',
      measure: (userId) => this.count(costSources, eq(costSources.userId, userId)),
      tiers: achievementTiers(
        [
          1,
          '🤖',
          { en: 'Automation', ru: 'Автоматизация' },
          { en: 'Connect automatic cost import', ru: 'Подключить автоимпорт затрат' },
        ],
        [
          3,
          '🏭',
          { en: 'Cost control', ru: 'Контроль затрат' },
          { en: '3 connected cost sources', ru: '3 подключённых источника затрат' },
        ],
      ),
    });
  }

  /** The wishlist: what was wanted and then bought. */
  private registerWishlist(): void {
    this.achievements.register({
      id: 'finance.wishes-saved-for',
      module: 'finance',
      measure: (userId) =>
        this.count(
          wishes,
          and(eq(wishes.userId, userId), isNotNull(wishes.boughtAt), isNotNull(wishes.goalId)),
        ),
      tiers: [
        achievementTier(
          1,
          '🎯',
          { en: 'Saved up and bought', ru: 'Накопил и купил' },
          {
            en: 'A wish that had a savings goal is bought',
            ru: 'Куплено желание, на которое была цель накоплений',
          },
        ),
      ],
    });
    this.achievements.register({
      id: 'finance.wishes-bought',
      module: 'finance',
      measure: (userId) =>
        this.count(wishes, and(eq(wishes.userId, userId), isNotNull(wishes.boughtAt))),
      tiers: achievementTiers(
        [
          1,
          '🎁',
          { en: 'A wish come true', ru: 'Мечта сбылась' },
          { en: 'Buy something from the wishlist', ru: 'Купить что-нибудь из списка желаний' },
        ],
        [
          10,
          '🛍️',
          { en: 'Patient buyer', ru: 'Терпеливый покупатель' },
          { en: '10 wishes bought', ru: '10 купленных желаний' },
        ],
      ),
    });
  }

  /**
   * The finished months, the last first, within every budget — until one went over or had no
   * records at all. The budgets have no history: a month is held against today's limits.
   */
  private async monthsWithinBudgets(userId: string): Promise<number> {
    let kept = 0;
    for (const month of finishedMonths(BUDGET_MONTHS_BACK)) {
      const budgets = await this.budgets.list(userId, month);
      if (!budgets.length || !(await this.hasTransactions(userId, month))) {
        break;
      }
      if (budgets.some((budget) => budget.spent > budget.limit)) {
        break;
      }
      kept++;
    }
    return kept;
  }

  /** The longest run of finished months in a row with more income than expenses. */
  private async positiveMonths(userId: string): Promise<number> {
    const [lastFinished] = finishedMonths(1);
    const { months } = await this.transactionsService.cashFlowInMain(userId, {
      from: '1970-01-01',
      to: lastDayOf(lastFinished),
    });
    let best = 0;
    let run = 0;
    let previous: string | null = null;
    for (const { month, income, expense } of months) {
      const follows = previous !== null && nextMonth(previous) === month;
      run = income > expense ? (follows ? run + 1 : 1) : 0;
      best = Math.max(best, run);
      previous = month;
    }
    return best;
  }

  private async hasTransactions(userId: string, month: string): Promise<boolean> {
    const [row] = await this.db
      .select({ value: count() })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          sql`to_char(${transactions.occurredOn}, 'YYYY-MM') = ${month}`,
        ),
      );
    return (row?.value ?? 0) > 0;
  }

  private async monthsWithTransactions(userId: string): Promise<number> {
    const [row] = await this.db
      .select({
        months: sql<number>`count(DISTINCT date_trunc('month', ${transactions.occurredOn}))::int`,
      })
      .from(transactions)
      .where(eq(transactions.userId, userId));
    return row?.months ?? 0;
  }

  private async count(
    table: typeof transactions | typeof recurringPayments | typeof costSources | typeof wishes,
    where: SQL | undefined,
  ): Promise<number> {
    const [row] = await this.db.select({ value: count() }).from(table).where(where);
    return row?.value ?? 0;
  }
}

/** The finished months (`YYYY-MM`), the last one first. */
function finishedMonths(howMany: number): string[] {
  const now = new Date();
  return Array.from({ length: howMany }, (_, index) => {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1 - index, 1));
    return day.toISOString().slice(0, 7);
  });
}

/** `2026-12` → `2027-01`. */
function nextMonth(month: string): string {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 7);
}

/** `2026-02` → `2026-02-28`. */
function lastDayOf(month: string): string {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
}
