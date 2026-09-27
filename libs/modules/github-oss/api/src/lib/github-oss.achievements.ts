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
        achievementTier(10, '⭐', 'Первые звёзды', '10 звёзд суммарно на твоих репозиториях'),
        achievementTier(50, '🌟', 'Замечен', '50 звёзд суммарно'),
        achievementTier(100, '✨', 'Сотня звёзд', '100 звёзд суммарно'),
        achievementTier(500, '🌠', 'Созвездие', '500 звёзд суммарно'),
        achievementTier(1000, '🌌', 'Галактика', '1000 звёзд суммарно'),
      ],
    });

    this.achievements.register({
      id: 'github-oss.npm-weekly',
      module: 'github-oss',
      measure: (userId) => this.total(userId, 'npmWeeklyDownloads'),
      tiers: [
        achievementTier(1_000, '📦', 'Тысяча установок', '1 000 загрузок npm за неделю'),
        achievementTier(10_000, '🚚', 'Поток', '10 000 загрузок npm за неделю'),
        achievementTier(100_000, '🏭', 'Инфраструктура', '100 000 загрузок npm за неделю'),
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
