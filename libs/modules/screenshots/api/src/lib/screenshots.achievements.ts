import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {
  AchievementsService,
  achievementTiers,
  DB,
  Database,
} from '@pd/api-core';
import {eq} from 'drizzle-orm';
import {screenshots} from './screenshots.schema';

/** Screenshots achievements: how many are kept (taken on the computer and synced here). */
@Injectable()
export class ScreenshotsAchievements implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
  ) {}

  onModuleInit(): void {
    this.achievements.register({
      id: 'screenshots.kept',
      module: 'screenshots',
      measure: userId =>
        this.db.$count(screenshots, eq(screenshots.userId, userId)),
      tiers: achievementTiers(
        [
          1,
          '📸',
          {en: 'Snap', ru: 'Щёлк'},
          {en: 'The first screenshot', ru: 'Первый скриншот'},
        ],
        [
          10,
          '🖼️',
          {en: 'A little gallery', ru: 'Маленькая галерея'},
          {en: '10 screenshots', ru: '10 скриншотов'},
        ],
        [
          100,
          '🗂️',
          {en: 'An archive', ru: 'Архив'},
          {en: '100 screenshots', ru: '100 скриншотов'},
        ],
        [
          500,
          '🎞️',
          {en: 'Screen archivist', ru: 'Архивариус экрана'},
          {en: '500 screenshots', ru: '500 скриншотов'},
        ],
        [
          1000,
          '🏛️',
          {en: 'A museum of the screen', ru: 'Музей экрана'},
          {en: '1,000 screenshots', ru: '1 000 скриншотов'},
        ],
      ),
    });
  }
}
