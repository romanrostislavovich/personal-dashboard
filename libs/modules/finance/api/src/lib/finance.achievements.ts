import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { achievementTier, AchievementsService, DB, Database } from '@pd/api-core';
import { eq, sql } from 'drizzle-orm';
import { transactions } from './finance.schema';

/** Ачивки финансов: сколько месяцев ведётся учёт. */
@Injectable()
export class FinanceAchievements implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
  ) {}

  onModuleInit(): void {
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
}
