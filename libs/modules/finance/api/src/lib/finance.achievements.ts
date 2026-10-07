import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { achievementTier, achievementTiers, AchievementsService, DB, Database } from '@pd/api-core';
import { and, count, eq, isNotNull, SQL, sql } from 'drizzle-orm';
import { costSources, recurringPayments, transactions, wishes } from './finance.schema';
import { SubscriptionsService } from './recurring/subscriptions.service';

/** Finance achievements: for how many months the records have been kept. */
@Injectable()
export class FinanceAchievements implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  onModuleInit(): void {
    this.registerTracking();
    this.registerAutomation();
    this.registerWishlist();
    this.registerSubscriptionUse();
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
