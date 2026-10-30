import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {
  AchievementsService,
  achievementTiers,
  DB,
  Database,
} from '@pd/api-core';
import {sql} from 'drizzle-orm';
import {healthBandDays, healthBandReactions} from './band.schema';

/** A good night by the sleep score (Health → Band, 0–100). */
const GOOD_SLEEP_SCORE = 80;
/** A walking day. */
const STEPS_GOAL = 10_000;

/**
 * Band achievements, in the spirit of the module's: they reward looking after yourself — wearing
 * the band, sleeping well, walking, taking a breath, noticing what the body says — never a
 * number of the body itself (a pulse, a stress index) as good or bad.
 */
@Injectable()
export class BandAchievements implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
  ) {}

  onModuleInit(): void {
    this.achievements.register({
      id: 'health.band-days',
      module: 'health',
      measure: userId =>
        this.countDays(
          userId,
          sql`steps IS NOT NULL OR sleep_minutes IS NOT NULL`,
        ),
      tiers: achievementTiers(
        [
          7,
          '⌚',
          {en: 'On the wrist', ru: 'На запястье'},
          {
            en: '7 days with the band',
            ru: '7 дней с браслетом',
          },
        ],
        [
          30,
          '📈',
          {en: 'A month of data', ru: 'Месяц данных'},
          {en: '30 days with the band', ru: '30 дней с браслетом'},
        ],
        [
          100,
          '🛰️',
          {en: 'Always in touch', ru: 'Всегда на связи'},
          {en: '100 days with the band', ru: '100 дней с браслетом'},
        ],
        [
          365,
          '🌍',
          {en: 'A year on the wrist', ru: 'Год на запястье'},
          {en: '365 days with the band', ru: '365 дней с браслетом'},
        ],
      ),
    });

    this.achievements.register({
      id: 'health.good-nights',
      module: 'health',
      measure: userId =>
        this.countDays(userId, sql`sleep_score >= ${GOOD_SLEEP_SCORE}`),
      tiers: achievementTiers(
        [
          1,
          '😴',
          {en: 'A good night', ru: 'Хорошая ночь'},
          {
            en: `A night with a sleep score of ${GOOD_SLEEP_SCORE} or more`,
            ru: `Ночь с оценкой сна ${GOOD_SLEEP_SCORE} и выше`,
          },
        ],
        [
          10,
          '🌙',
          {en: 'Well rested', ru: 'Выспался'},
          {
            en: `10 nights with a sleep score of ${GOOD_SLEEP_SCORE} or more`,
            ru: `10 ночей с оценкой сна ${GOOD_SLEEP_SCORE} и выше`,
          },
        ],
        [
          50,
          '🛌',
          {en: 'Sleep is a skill', ru: 'Сон — это навык'},
          {
            en: `50 nights with a sleep score of ${GOOD_SLEEP_SCORE} or more`,
            ru: `50 ночей с оценкой сна ${GOOD_SLEEP_SCORE} и выше`,
          },
        ],
      ),
    });

    this.achievements.register({
      id: 'health.walking-days',
      module: 'health',
      measure: userId => this.countDays(userId, sql`steps >= ${STEPS_GOAL}`),
      tiers: achievementTiers(
        [
          1,
          '👟',
          {en: 'Ten thousand steps', ru: 'Десять тысяч шагов'},
          {
            en: 'A day of 10,000 steps or more',
            ru: 'День в 10 000 шагов и больше',
          },
        ],
        [
          30,
          '🚶',
          {en: 'A walker', ru: 'Ходок'},
          {
            en: '30 days of 10,000 steps or more',
            ru: '30 дней по 10 000 шагов и больше',
          },
        ],
        [
          100,
          '🥾',
          {en: 'Miles behind', ru: 'Километры позади'},
          {
            en: '100 days of 10,000 steps or more',
            ru: '100 дней по 10 000 шагов и больше',
          },
        ],
      ),
    });

    this.achievements.register({
      id: 'health.mindful-minutes',
      module: 'health',
      measure: userId => this.mindfulMinutes(userId),
      tiers: achievementTiers(
        [
          10,
          '🫁',
          {en: 'A breath', ru: 'Вдох'},
          {
            en: '10 minutes of breathing and mindfulness',
            ru: '10 минут дыхания и осознанности',
          },
        ],
        [
          60,
          '🧘',
          {en: 'An hour of calm', ru: 'Час спокойствия'},
          {
            en: 'An hour of breathing and mindfulness',
            ru: 'Час дыхания и осознанности',
          },
        ],
        [
          300,
          '🪷',
          {en: 'Inner quiet', ru: 'Внутренняя тишина'},
          {
            en: '5 hours of breathing and mindfulness',
            ru: '5 часов дыхания и осознанности',
          },
        ],
      ),
    });

    this.achievements.register({
      id: 'health.reactions-noted',
      module: 'health',
      measure: userId => this.reactionsNoted(userId),
      tiers: achievementTiers(
        [
          1,
          '👂',
          {en: 'Listening to the body', ru: 'Слушаю тело'},
          {
            en: 'Told how you felt when the band noticed a reaction of the body',
            ru: 'Ответил, что чувствовал, когда браслет заметил реакцию тела',
          },
        ],
        [
          20,
          '🧩',
          {en: 'Knowing yourself', ru: 'Знаю себя'},
          {
            en: '20 reactions of the body answered with a feeling',
            ru: '20 реакций тела с ответом, что чувствовал',
          },
        ],
      ),
    });
  }

  private async countDays(
    userId: string,
    condition: ReturnType<typeof sql>,
  ): Promise<number> {
    const {rows} = await this.db.execute<{value: number}>(sql`
      SELECT count(*)::int AS value FROM ${healthBandDays}
      WHERE user_id = ${userId} AND (${condition})
    `);
    return rows[0]?.value ?? 0;
  }

  private async mindfulMinutes(userId: string): Promise<number> {
    const {rows} = await this.db.execute<{value: number}>(sql`
      SELECT coalesce(sum(mindfulness_minutes), 0)::int AS value FROM ${healthBandDays}
      WHERE user_id = ${userId}
    `);
    return rows[0]?.value ?? 0;
  }

  private async reactionsNoted(userId: string): Promise<number> {
    const {rows} = await this.db.execute<{value: number}>(sql`
      SELECT count(*)::int AS value FROM ${healthBandReactions}
      WHERE user_id = ${userId} AND feeling IS NOT NULL
    `);
    return rows[0]?.value ?? 0;
  }
}
