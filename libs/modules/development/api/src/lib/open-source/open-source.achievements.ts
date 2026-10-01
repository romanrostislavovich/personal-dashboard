import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { achievementTier, achievementTiers, AchievementsService, DB, Database } from '@pd/api-core';
import { and, count, eq, sum } from 'drizzle-orm';
import { trackedRepos } from './open-source.schema';

/** Open source achievements: stars, forks and npm downloads across the user's own repositories. */
@Injectable()
export class OpenSourceAchievements implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
  ) {}

  onModuleInit(): void {
    this.registerPopularity();
    this.registerCommunity();
  }

  /** Stars and npm downloads. */
  private registerPopularity(): void {
    this.achievements.register({
      id: 'development.stars',
      module: 'development',
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
      id: 'development.npm-weekly',
      module: 'development',
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

  /** Forks and the number of own repositories. */
  private registerCommunity(): void {
    this.achievements.register({
      id: 'development.forks',
      module: 'development',
      measure: (userId) => this.total(userId, 'forks'),
      tiers: achievementTiers(
        [
          10,
          '🍴',
          { en: 'Forked', ru: 'Форкнули' },
          { en: '10 forks in total', ru: '10 форков суммарно' },
        ],
        [
          50,
          '🌳',
          { en: 'Family tree', ru: 'Родословная' },
          { en: '50 forks in total', ru: '50 форков суммарно' },
        ],
      ),
    });
    this.achievements.register({
      id: 'development.repos',
      module: 'development',
      measure: (userId) => this.repoCount(userId),
      tiers: achievementTiers(
        [
          5,
          '📦',
          { en: 'Portfolio', ru: 'Портфолио' },
          {
            en: '5 public repositories of your own, forks aside',
            ru: '5 своих публичных репозиториев, не считая форков',
          },
        ],
        [
          15,
          '🗂️',
          { en: 'Maintainer', ru: 'Мейнтейнер' },
          {
            en: '15 public repositories of your own, forks aside',
            ru: '15 своих публичных репозиториев, не считая форков',
          },
        ],
      ),
    });
  }

  private async total(
    userId: string,
    column: 'stars' | 'forks' | 'npmWeeklyDownloads',
  ): Promise<number> {
    const [row] = await this.db
      .select({ total: sum(trackedRepos[column]).mapWith(Number) })
      .from(trackedRepos)
      .where(this.own(userId));
    return row?.total ?? 0;
  }

  /**
   * Achievements are about one's own work: organizations' and hand-added repositories do not
   * count, and neither do forks of other people's projects.
   */
  private own(userId: string) {
    return and(
      eq(trackedRepos.userId, userId),
      eq(trackedRepos.relation, 'owner'),
      eq(trackedRepos.isFork, false),
    );
  }

  private async repoCount(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(trackedRepos)
      .where(this.own(userId));
    return row?.value ?? 0;
  }
}
