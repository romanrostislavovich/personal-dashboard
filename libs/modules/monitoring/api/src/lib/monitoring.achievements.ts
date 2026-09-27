import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { achievementTier, AchievementsService, DB, Database } from '@pd/api-core';
import { sql } from 'drizzle-orm';
import { checkResults, monitors } from './monitoring.schema';

/** Ачивки мониторинга: сколько дней все сайты работают без единого сбоя. */
@Injectable()
export class MonitoringAchievements implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
  ) {}

  onModuleInit(): void {
    this.achievements.register({
      id: 'monitoring.days-without-failures',
      module: 'monitoring',
      measure: (userId) => this.daysWithoutFailures(userId),
      tiers: [
        achievementTier(
          7,
          '🛡️',
          { en: 'A week without failures', ru: 'Неделя без сбоев' },
          {
            en: 'All sites respond without errors for 7 days',
            ru: 'Все сайты отвечают без ошибок 7 дней подряд',
          },
        ),
        achievementTier(
          30,
          '🏰',
          { en: 'A month without failures', ru: 'Месяц без сбоев' },
          {
            en: 'All sites respond without errors for 30 days',
            ru: 'Все сайты отвечают без ошибок 30 дней подряд',
          },
        ),
      ],
    });
  }

  /**
   * Для каждого монитора — дни с последней неудачной проверки (или с момента добавления),
   * а результат — худший из мониторов. Нет мониторов — 0.
   */
  private async daysWithoutFailures(userId: string): Promise<number> {
    const result = await this.db.execute<{ days: number | null }>(sql`
      SELECT min(floor(extract(epoch FROM now() - greatest(m.created_at, f.last_failure)) / 86400))::int AS days
      FROM ${monitors} m
      LEFT JOIN LATERAL (
        SELECT max(checked_at) AS last_failure
        FROM ${checkResults}
        WHERE monitor_id = m.id AND NOT is_up
      ) f ON true
      WHERE m.user_id = ${userId}
    `);
    return result.rows[0]?.days ?? 0;
  }
}
