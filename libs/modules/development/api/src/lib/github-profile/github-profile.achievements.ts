import { Injectable, OnModuleInit } from '@nestjs/common';
import { AchievementsService, achievementTiers, AchievementTierTuple } from '@pd/api-core';
import { contributionStats } from './contribution-stats';
import { GithubProfileService } from './github-profile.service';

type Totals = Awaited<ReturnType<GithubProfileService['totals']>>;

/** GitHub account achievements: contributions, streaks, pull requests, reviews, followers. */
@Injectable()
export class GithubProfileAchievements implements OnModuleInit {
  constructor(
    private readonly achievements: AchievementsService,
    private readonly profiles: GithubProfileService,
  ) {}

  onModuleInit(): void {
    this.registerContributions();
    this.registerStreaks();
    this.registerCollaboration();
  }

  /** How much was done in total and in the best day. */
  private registerContributions(): void {
    this.total('development.contributions', 'contributions', [
      [
        100,
        '🌱',
        { en: 'First sprouts', ru: 'Первые ростки' },
        { en: '100 contributions on GitHub', ru: '100 контрибуций на GitHub' },
      ],
      [
        500,
        '🌿',
        { en: 'Taking root', ru: 'Пустил корни' },
        { en: '500 contributions', ru: '500 контрибуций' },
      ],
      [
        1000,
        '🌳',
        { en: 'A thousand squares', ru: 'Тысяча квадратиков' },
        { en: '1,000 contributions', ru: '1 000 контрибуций' },
      ],
      [
        5000,
        '🌲',
        { en: 'Green forest', ru: 'Зелёный лес' },
        { en: '5,000 contributions', ru: '5 000 контрибуций' },
      ],
      [
        10_000,
        '🏞️',
        { en: 'National park', ru: 'Заповедник' },
        { en: '10,000 contributions', ru: '10 000 контрибуций' },
      ],
    ]);
    this.total('development.commits', 'commits', [
      [100, '💾', { en: 'Committed', ru: 'Закоммитил' }, { en: '100 commits', ru: '100 коммитов' }],
      [
        1000,
        '📚',
        { en: 'Long history', ru: 'Длинная история' },
        { en: '1,000 commits', ru: '1 000 коммитов' },
      ],
      [
        5000,
        '🏛️',
        { en: 'git log --all', ru: 'git log --all' },
        { en: '5,000 commits', ru: '5 000 коммитов' },
      ],
    ]);
    this.calendar('development.busiest-day', (stats) => stats.busiestDay?.count ?? 0, [
      [
        10,
        '⚡',
        { en: 'Productive day', ru: 'Продуктивный день' },
        { en: '10 contributions in one day', ru: '10 контрибуций за один день' },
      ],
      [
        25,
        '🚀',
        { en: 'In the flow', ru: 'В потоке' },
        { en: '25 contributions in one day', ru: '25 контрибуций за один день' },
      ],
      [
        50,
        '🌋',
        { en: 'Eruption', ru: 'Извержение' },
        { en: '50 contributions in one day', ru: '50 контрибуций за один день' },
      ],
    ]);
  }

  /** Days in a row with a contribution. */
  private registerStreaks(): void {
    this.calendar('development.contribution-streak', (stats) => stats.streak.longest, [
      [
        7,
        '🔥',
        { en: 'A week of code', ru: 'Неделя кода' },
        { en: '7 days in a row with a contribution', ru: '7 дней подряд с контрибуцией' },
      ],
      [
        30,
        '📅',
        { en: 'A month without a gap', ru: 'Месяц без пропусков' },
        { en: '30 days in a row', ru: '30 дней подряд' },
      ],
      [
        100,
        '💯',
        { en: 'Hundred days of code', ru: 'Сто дней кода' },
        { en: '100 days in a row', ru: '100 дней подряд' },
      ],
      [
        365,
        '🗓️',
        { en: 'A green year', ru: 'Зелёный год' },
        { en: '365 days in a row', ru: '365 дней подряд' },
      ],
    ]);
  }

  /** Working with other people's code and being noticed. */
  private registerCollaboration(): void {
    this.total('development.pull-requests', 'pullRequests', [
      [
        10,
        '🔀',
        { en: 'Pull request, please', ru: 'Примите PR' },
        { en: '10 pull requests', ru: '10 пулл-реквестов' },
      ],
      [
        50,
        '🧩',
        { en: 'Contributor', ru: 'Контрибьютор' },
        { en: '50 pull requests', ru: '50 пулл-реквестов' },
      ],
      [
        200,
        '🏗️',
        { en: 'Builder', ru: 'Строитель' },
        { en: '200 pull requests', ru: '200 пулл-реквестов' },
      ],
      [
        1000,
        '🏭',
        { en: 'PR factory', ru: 'Фабрика PR' },
        { en: '1,000 pull requests', ru: '1 000 пулл-реквестов' },
      ],
    ]);
    this.total('development.reviews', 'reviews', [
      [
        10,
        '👀',
        { en: 'Second pair of eyes', ru: 'Вторая пара глаз' },
        { en: '10 code reviews', ru: '10 код-ревью' },
      ],
      [50, '🔍', { en: 'Reviewer', ru: 'Ревьюер' }, { en: '50 code reviews', ru: '50 код-ревью' }],
      [200, '🧐', { en: 'LGTM', ru: 'LGTM' }, { en: '200 code reviews', ru: '200 код-ревью' }],
    ]);
    this.total('development.issues', 'issues', [
      [
        10,
        '🐛',
        { en: 'Bug hunter', ru: 'Охотник за багами' },
        { en: '10 issues opened', ru: '10 открытых issues' },
      ],
      [
        100,
        '🕵️',
        { en: 'Nothing escapes', ru: 'Ничего не скроется' },
        { en: '100 issues opened', ru: '100 открытых issues' },
      ],
    ]);
    this.achievements.register({
      id: 'development.followers',
      module: 'development',
      measure: (userId) => this.profiles.followers(userId),
      tiers: achievementTiers(
        [
          10,
          '👋',
          { en: 'Not alone', ru: 'Не один' },
          { en: '10 followers on GitHub', ru: '10 подписчиков на GitHub' },
        ],
        [
          50,
          '👥',
          { en: 'Audience', ru: 'Аудитория' },
          { en: '50 followers', ru: '50 подписчиков' },
        ],
        [
          100,
          '📣',
          { en: 'A hundred followers', ru: 'Сотня подписчиков' },
          { en: '100 followers', ru: '100 подписчиков' },
        ],
        [
          500,
          '🌐',
          { en: 'Known in the community', ru: 'Известен в сообществе' },
          { en: '500 followers', ru: '500 подписчиков' },
        ],
      ),
    });
  }

  /** A metric that is a sum over all years. */
  private total(id: string, field: keyof Totals, tiers: AchievementTierTuple[]): void {
    this.achievements.register({
      id,
      module: 'development',
      measure: async (userId) => (await this.profiles.totals(userId))[field],
      tiers: achievementTiers(...tiers),
    });
  }

  /** A metric computed from the saved calendar. */
  private calendar(
    id: string,
    value: (stats: ReturnType<typeof contributionStats>) => number,
    tiers: AchievementTierTuple[],
  ): void {
    this.achievements.register({
      id,
      module: 'development',
      measure: async (userId) =>
        value(contributionStats(await this.profiles.allDays(userId), this.profiles.today())),
      tiers: achievementTiers(...tiers),
    });
  }
}
