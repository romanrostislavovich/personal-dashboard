import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AchievementsService, achievementTiers, DB, Database } from '@pd/api-core';
import { count, eq, sql } from 'drizzle-orm';
import { psychologyAssessments, psychologyEvents } from './psychology.schema';

/**
 * Psychology achievements reward the regularity of watching oneself — a questionnaire month
 * after month, the events of a life written down — never a score: a better or worse result of
 * a questionnaire is not something to win.
 */
@Injectable()
export class PsychologyAchievements implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
  ) {}

  onModuleInit(): void {
    this.achievements.register({
      id: 'psychology.checkin-months',
      module: 'psychology',
      measure: (userId) => this.checkinMonths(userId),
      tiers: achievementTiers(
        [
          3,
          '🪞',
          { en: 'Checking in', ru: 'На связи с собой' },
          {
            en: 'A questionnaire 3 months in a row',
            ru: 'Опросник 3 месяца подряд',
          },
        ],
        [
          6,
          '🧘',
          { en: 'Half a year of attention', ru: 'Полгода внимания' },
          {
            en: 'A questionnaire 6 months in a row',
            ru: 'Опросник 6 месяцев подряд',
          },
        ],
        [
          12,
          '🌳',
          { en: 'A year with myself', ru: 'Год с собой' },
          {
            en: 'A questionnaire 12 months in a row',
            ru: 'Опросник 12 месяцев подряд',
          },
        ],
      ),
    });

    this.achievements.register({
      id: 'psychology.events',
      module: 'psychology',
      measure: (userId) => this.events(userId),
      tiers: achievementTiers(
        [
          10,
          '📖',
          { en: 'Chapters of a life', ru: 'Главы жизни' },
          { en: '10 events of a life written down', ru: '10 событий жизни записано' },
        ],
        [
          30,
          '🗺️',
          { en: 'The map of a life', ru: 'Карта жизни' },
          { en: '30 events of a life written down', ru: '30 событий жизни записано' },
        ],
      ),
    });
  }

  /** The longest run of calendar months, each with at least one questionnaire. */
  private async checkinMonths(userId: string): Promise<number> {
    const result = await this.db.execute<{ streak: number | null }>(sql`
      WITH months AS (
        SELECT DISTINCT date_trunc('month', taken_on)::date AS month
        FROM ${psychologyAssessments}
        WHERE user_id = ${userId}
      ), runs AS (
        SELECT month,
          (extract(year FROM month) * 12 + extract(month FROM month))
            - row_number() OVER (ORDER BY month) AS run
        FROM months
      )
      SELECT max(length)::int AS streak
      FROM (SELECT count(*) AS length FROM runs GROUP BY run) lengths
    `);
    return result.rows[0]?.streak ?? 0;
  }

  private async events(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(psychologyEvents)
      .where(eq(psychologyEvents.userId, userId));
    return row?.value ?? 0;
  }
}
