import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {
  AchievementsService,
  achievementTiers,
  DB,
  Database,
} from '@pd/api-core';
import {and, count, eq, isNotNull} from 'drizzle-orm';
import {activityPlaceQuestions} from './places.schema';

/** The places of the phone: the map of one's own life, filled in by answering "Where were you?". */
@Injectable()
export class PlacesAchievements implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
  ) {}

  onModuleInit(): void {
    this.achievements.register({
      id: 'activity.places-answered',
      module: 'activity',
      measure: async userId => {
        const [row] = await this.db
          .select({value: count()})
          .from(activityPlaceQuestions)
          .where(
            and(
              eq(activityPlaceQuestions.userId, userId),
              isNotNull(activityPlaceQuestions.answeredAt),
            ),
          );
        return row?.value ?? 0;
      },
      tiers: achievementTiers(
        [
          1,
          '📍',
          {en: 'I was here', ru: 'Я был здесь'},
          {
            en: 'Answered "Where were you?" for the first time',
            ru: 'Впервые ответил на «Где ты был?»',
          },
        ],
        [
          10,
          '🗺️',
          {en: 'My own map', ru: 'Своя карта'},
          {
            en: '10 places named by answering "Where were you?"',
            ru: '10 мест названо ответом на «Где ты был?»',
          },
        ],
        [
          50,
          '🧭',
          {en: 'Cartographer', ru: 'Картограф'},
          {
            en: '50 places named by answering "Where were you?"',
            ru: '50 мест названо ответом на «Где ты был?»',
          },
        ],
      ),
    });
  }
}
