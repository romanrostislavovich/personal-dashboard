import { Injectable, OnModuleInit } from '@nestjs/common';
import { AchievementsService, achievementTiers } from '@pd/api-core';
import { WritingService } from './writing.service';

/**
 * Writing achievements: the fixes taken from the suggestions — in the browser extension and in
 * every program through the desktop app.
 */
@Injectable()
export class WritingAchievements implements OnModuleInit {
  constructor(
    private readonly achievements: AchievementsService,
    private readonly writing: WritingService,
  ) {}

  onModuleInit(): void {
    this.achievements.register({
      id: 'writing.fixes',
      module: 'writing',
      measure: (userId) => this.writing.fixesAccepted(userId),
      tiers: achievementTiers(
        [
          1,
          '✏️',
          { en: 'The first fix', ru: 'Первая правка' },
          { en: 'A suggested fix taken', ru: 'Принято первое исправление' },
        ],
        [
          50,
          '📝',
          { en: 'Clean copy', ru: 'Чистовик' },
          { en: '50 fixes taken', ru: '50 принятых исправлений' },
        ],
        [
          250,
          '📚',
          { en: 'The proofreader', ru: 'Корректор' },
          { en: '250 fixes taken', ru: '250 принятых исправлений' },
        ],
        [
          1000,
          '🖋️',
          { en: 'The editor', ru: 'Редактор' },
          { en: '1,000 fixes taken', ru: '1 000 принятых исправлений' },
        ],
        [
          5000,
          '🏆',
          { en: 'A flawless pen', ru: 'Безупречное перо' },
          { en: '5,000 fixes taken', ru: '5 000 принятых исправлений' },
        ],
      ),
    });
  }
}
