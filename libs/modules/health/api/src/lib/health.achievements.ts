import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {
  AchievementsService,
  achievementTiers,
  DB,
  Database,
} from '@pd/api-core';
import {healthConditions, HealthDiagnosis} from '@pd/contracts';
import {and, count, eq, sql} from 'drizzle-orm';
import {healthDiagnoses, healthIntakes} from './health.schema';

/**
 * Health achievements reward taking care, never an illness: taking the medications on time,
 * day after day, and a diagnosis taken off. Nothing counts diagnoses, visits or results — a
 * longer history of illness is not an achievement.
 */
@Injectable()
export class HealthAchievements implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
  ) {}

  onModuleInit(): void {
    this.registerIntakes();
    this.registerRecovery();
  }

  /** Medication reminders answered "taken" (intakes/intakes.service.ts). */
  private registerIntakes(): void {
    this.achievements.register({
      id: 'health.intake-streak',
      module: 'health',
      measure: userId => this.intakeStreak(userId),
      tiers: achievementTiers(
        [
          7,
          '💊',
          {en: 'A week on schedule', ru: 'Неделя по графику'},
          {
            en: '7 days of medications in a row, every dose taken',
            ru: '7 дней приёма лекарств подряд — все дозы приняты',
          },
        ],
        [
          30,
          '🗓️',
          {en: 'A month on schedule', ru: 'Месяц по графику'},
          {
            en: '30 days of medications in a row, every dose taken',
            ru: '30 дней приёма лекарств подряд — все дозы приняты',
          },
        ],
        [
          100,
          '🧭',
          {en: 'Steady course', ru: 'Твёрдый курс'},
          {
            en: '100 days of medications in a row, every dose taken',
            ru: '100 дней приёма лекарств подряд — все дозы приняты',
          },
        ],
        [
          365,
          '🏔️',
          {en: 'A year of care', ru: 'Год заботы'},
          {
            en: '365 days of medications in a row, every dose taken',
            ru: '365 дней приёма лекарств подряд — все дозы приняты',
          },
        ],
      ),
    });

    this.achievements.register({
      id: 'health.intakes-taken',
      module: 'health',
      measure: userId => this.intakesTaken(userId),
      tiers: achievementTiers(
        [
          30,
          '✅',
          {en: 'Thirty doses', ru: 'Тридцать доз'},
          {
            en: '30 doses taken on a reminder',
            ru: '30 доз принято по напоминанию',
          },
        ],
        [
          100,
          '📋',
          {en: 'A hundred doses', ru: 'Сотня доз'},
          {
            en: '100 doses taken on a reminder',
            ru: '100 доз принято по напоминанию',
          },
        ],
        [
          500,
          '⏰',
          {en: 'Like clockwork', ru: 'Как часы'},
          {
            en: '500 doses taken on a reminder',
            ru: '500 доз принято по напоминанию',
          },
        ],
        [
          1000,
          '🏅',
          {en: 'A thousand doses', ru: 'Тысяча доз'},
          {
            en: '1,000 doses taken on a reminder',
            ru: '1 000 доз принято по напоминанию',
          },
        ],
      ),
    });
  }

  /** A condition that was there and is over: recovered, or the diagnosis did not hold. */
  private registerRecovery(): void {
    this.achievements.register({
      id: 'health.diagnoses-taken-off',
      module: 'health',
      measure: userId => this.takenOff(userId),
      tiers: achievementTiers(
        [
          1,
          '🕊️',
          {en: 'Diagnosis taken off', ru: 'Диагноз снят'},
          {
            en: 'A diagnosis that was set is taken off: recovered, or it did not hold',
            ru: 'Поставленный диагноз снят: выздоровление или он не подтвердился',
          },
          'rare',
        ],
        [
          3,
          '🌤️',
          {en: 'Behind me', ru: 'Позади'},
          {en: 'Three diagnoses taken off', ru: 'Три диагноза сняты'},
          'epic',
        ],
      ),
    });
  }

  /**
   * The longest run of days that had doses, every one of them taken. Days without a dose (a
   * medication every other day, a break) neither count nor break the run; a dose skipped, or
   * left unanswered on a day already over, does. Today is not judged until it is over.
   */
  private async intakeStreak(userId: string): Promise<number> {
    const result = await this.db.execute<{streak: number | null}>(sql`
      WITH days AS (
        SELECT day, bool_and(status = 'taken') AS ok
        FROM ${healthIntakes}
        WHERE user_id = ${userId} AND day < current_date
        GROUP BY day
      ), runs AS (
        SELECT ok,
          row_number() OVER (ORDER BY day) - row_number() OVER (PARTITION BY ok ORDER BY day) AS run
        FROM days
      )
      SELECT max(length)::int AS streak
      FROM (SELECT count(*) AS length FROM runs WHERE ok GROUP BY run) lengths
    `);
    return result.rows[0]?.streak ?? 0;
  }

  private async intakesTaken(userId: string): Promise<number> {
    const [row] = await this.db
      .select({value: count()})
      .from(healthIntakes)
      .where(
        and(
          eq(healthIntakes.userId, userId),
          eq(healthIntakes.status, 'taken'),
        ),
      );
    return row?.value ?? 0;
  }

  /**
   * Conditions whose latest diagnosis is "resolved" or "ruled out" after one that was set
   * (confirmed or suspected) — taken off, not entered as ruled out from the start.
   */
  private async takenOff(userId: string): Promise<number> {
    const rows = await this.db
      .select({
        id: healthDiagnoses.id,
        system: healthDiagnoses.system,
        code: healthDiagnoses.code,
        title: healthDiagnoses.title,
        status: healthDiagnoses.status,
        diagnosedOn: healthDiagnoses.diagnosedOn,
      })
      .from(healthDiagnoses)
      .where(eq(healthDiagnoses.userId, userId));
    const diagnoses: HealthDiagnosis[] = rows.map(row => ({
      ...row,
      visitId: null,
      notes: null,
    }));
    return healthConditions(diagnoses).filter(
      condition =>
        (condition.status === 'resolved' || condition.status === 'ruledOut') &&
        condition.diagnoses.some(
          d => d.status === 'confirmed' || d.status === 'suspected',
        ),
    ).length;
  }
}
