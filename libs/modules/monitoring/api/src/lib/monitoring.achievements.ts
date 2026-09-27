import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { achievementTier, achievementTiers, AchievementsService, DB, Database } from '@pd/api-core';
import { count, eq, sql } from 'drizzle-orm';
import { checkResults, monitors } from './monitoring.schema';

/** Monitoring achievements: how many days all sites have run without a single failure. */
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
        achievementTier(
          100,
          '🪨',
          { en: 'Rock solid', ru: 'Скала' },
          {
            en: 'All sites respond without errors for 100 days',
            ru: 'Все сайты отвечают без ошибок 100 дней подряд',
          },
        ),
        achievementTier(
          365,
          '🛡️',
          { en: 'Year of uptime', ru: 'Год без падений' },
          {
            en: 'All sites respond without errors for 365 days',
            ru: 'Все сайты отвечают без ошибок 365 дней подряд',
          },
        ),
      ],
    });

    this.achievements.register({
      id: 'monitoring.monitors',
      module: 'monitoring',
      measure: (userId) => this.monitorCount(userId),
      tiers: achievementTiers(
        [
          3,
          '🛰️',
          { en: 'Watchtower', ru: 'Дозорный' },
          { en: '3 monitored addresses', ru: '3 адреса под мониторингом' },
        ],
        [
          10,
          '📡',
          { en: 'Mission control', ru: 'Центр управления' },
          { en: '10 monitored addresses', ru: '10 адресов под мониторингом' },
        ],
      ),
    });
  }

  /**
   * For each monitor — days since the last failed check (or since it was added),
   * and the result is the worst of the monitors. No monitors — 0.
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

  private async monitorCount(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(monitors)
      .where(eq(monitors.userId, userId));
    return row?.value ?? 0;
  }
}
