import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { achievementTier, AchievementsService, DB, Database } from '@pd/api-core';
import { eq, sum } from 'drizzle-orm';
import { trackedRepos } from './github-oss.schema';

/** Ачивки open source: звёзды и загрузки npm по всем отслеживаемым репозиториям. */
@Injectable()
export class GithubOssAchievements implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
  ) {}

  onModuleInit(): void {
    this.achievements.register({
      id: 'github-oss.stars',
      module: 'github-oss',
      measure: (userId) => this.total(userId, 'stars'),
      tiers: [
        achievementTier(
          10,
          '⭐',
          { en: 'First stars', ru: 'Первые звёзды' },
          {
            en: '10 stars across your repositories',
            ru: '10 звёзд суммарно на твоих репозиториях',
          },
        ),
        achievementTier(
          50,
          '🌟',
          { en: 'Noticed', ru: 'Замечен' },
          { en: '50 stars in total', ru: '50 звёзд суммарно' },
        ),
        achievementTier(
          100,
          '✨',
          { en: 'A hundred stars', ru: 'Сотня звёзд' },
          { en: '100 stars in total', ru: '100 звёзд суммарно' },
        ),
        achievementTier(
          500,
          '🌠',
          { en: 'Constellation', ru: 'Созвездие' },
          { en: '500 stars in total', ru: '500 звёзд суммарно' },
        ),
        achievementTier(
          1000,
          '🌌',
          { en: 'Galaxy', ru: 'Галактика' },
          { en: '1000 stars in total', ru: '1000 звёзд суммарно' },
        ),
      ],
    });

    this.achievements.register({
      id: 'github-oss.npm-weekly',
      module: 'github-oss',
      measure: (userId) => this.total(userId, 'npmWeeklyDownloads'),
      tiers: [
        achievementTier(
          1_000,
          '📦',
          { en: 'A thousand installs', ru: 'Тысяча установок' },
          { en: '1,000 npm downloads a week', ru: '1 000 загрузок npm за неделю' },
        ),
        achievementTier(
          10_000,
          '🚚',
          { en: 'Flow', ru: 'Поток' },
          { en: '10,000 npm downloads a week', ru: '10 000 загрузок npm за неделю' },
        ),
        achievementTier(
          100_000,
          '🏭',
          { en: 'Infrastructure', ru: 'Инфраструктура' },
          { en: '100,000 npm downloads a week', ru: '100 000 загрузок npm за неделю' },
        ),
      ],
    });
  }

  private async total(userId: string, column: 'stars' | 'npmWeeklyDownloads'): Promise<number> {
    const [row] = await this.db
      .select({ total: sum(trackedRepos[column]).mapWith(Number) })
      .from(trackedRepos)
      .where(eq(trackedRepos.userId, userId));
    return row?.total ?? 0;
  }
}
