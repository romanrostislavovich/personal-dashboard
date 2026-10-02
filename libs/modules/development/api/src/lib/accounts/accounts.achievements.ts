import { Injectable, OnModuleInit } from '@nestjs/common';
import { AchievementsService, achievementTiers, AchievementTierTuple } from '@pd/api-core';
import { CodeAccountsSummary, TokenProvider } from '@pd/contracts';
import { contributionStats } from '../github-profile/contribution-stats';
import { AccountsService } from './accounts.service';
import { CodeAccountsService } from './code-accounts.service';

const NAMES: Record<TokenProvider, string> = { gitlab: 'GitLab', bitbucket: 'Bitbucket' };

/**
 * Achievements of the GitLab and Bitbucket accounts, each on its own, and of all services
 * together. (The GitHub ones are in github-profile.achievements.ts.)
 */
@Injectable()
export class AccountsAchievements implements OnModuleInit {
  constructor(
    private readonly achievements: AchievementsService,
    private readonly accounts: AccountsService,
    private readonly stored: CodeAccountsService,
  ) {}

  onModuleInit(): void {
    this.registerService('gitlab', '🦊');
    this.registerService('bitbucket', '🪣');
    this.registerTogether();
  }

  /** One service: how much was done there and for how many days in a row. */
  private registerService(provider: TokenProvider, icon: string): void {
    const name = NAMES[provider];
    const total = async (userId: string, field: 'contributions' | 'commits') =>
      (await this.stored.years(userId, provider)).reduce((sum, year) => sum + year[field], 0);

    this.register(`development.${provider}-contributions`, (id) => total(id, 'contributions'), [
      [
        100,
        icon,
        { en: `At home on ${name}`, ru: `Свой на ${name}` },
        { en: `100 contributions on ${name}`, ru: `100 контрибуций на ${name}` },
      ],
      [
        1000,
        '🏗️',
        { en: `${name} regular`, ru: `Завсегдатай ${name}` },
        { en: `1,000 contributions on ${name}`, ru: `1 000 контрибуций на ${name}` },
      ],
      [
        5000,
        '🏰',
        { en: `${name} veteran`, ru: `Ветеран ${name}` },
        { en: `5,000 contributions on ${name}`, ru: `5 000 контрибуций на ${name}` },
      ],
    ]);
    this.register(`development.${provider}-commits`, (id) => total(id, 'commits'), [
      [
        100,
        '💾',
        { en: `Committed to ${name}`, ru: `Коммитил в ${name}` },
        { en: `100 commits on ${name}`, ru: `100 коммитов на ${name}` },
      ],
      [
        1000,
        '📚',
        { en: `A long ${name} history`, ru: `Длинная история на ${name}` },
        { en: `1,000 commits on ${name}`, ru: `1 000 коммитов на ${name}` },
      ],
    ]);
    this.register(
      `development.${provider}-streak`,
      async (id) =>
        contributionStats(await this.stored.allDays(id, provider), this.stored.today()).streak
          .longest,
      [
        [
          7,
          '🔥',
          { en: `A week on ${name}`, ru: `Неделя на ${name}` },
          { en: `7 days in a row on ${name}`, ru: `7 дней подряд на ${name}` },
        ],
        [
          30,
          '☄️',
          { en: `A month on ${name}`, ru: `Месяц на ${name}` },
          { en: `30 days in a row on ${name}`, ru: `30 дней подряд на ${name}` },
        ],
      ],
    );
  }

  /** All services as one. */
  private registerTogether(): void {
    const summary = (value: (summary: CodeAccountsSummary) => number) => async (id: string) => {
      const all = await this.accounts.summary(id);
      return all ? value(all) : 0;
    };

    this.register(
      'development.services',
      summary((all) => all.accounts.length),
      [
        [
          2,
          '🔗',
          { en: 'Two homes', ru: 'На два дома' },
          { en: 'Two code hosting services connected', ru: 'Подключено два сервиса с кодом' },
        ],
        [
          3,
          '🧭',
          { en: 'Everywhere at once', ru: 'Везде и сразу' },
          {
            en: 'GitHub, GitLab and Bitbucket connected',
            ru: 'Подключены GitHub, GitLab и Bitbucket',
          },
        ],
      ],
    );
    this.register(
      'development.all-contributions',
      summary((all) => all.totalContributions),
      [
        [
          1000,
          '🧱',
          { en: 'Brick by brick', ru: 'Кирпичик к кирпичику' },
          {
            en: '1,000 contributions across all services',
            ru: '1 000 контрибуций на всех сервисах',
          },
        ],
        [
          5000,
          '🏙️',
          { en: 'A city of code', ru: 'Город из кода' },
          {
            en: '5,000 contributions across all services',
            ru: '5 000 контрибуций на всех сервисах',
          },
        ],
        [
          20_000,
          '🌍',
          { en: 'A world of code', ru: 'Мир из кода' },
          {
            en: '20,000 contributions across all services',
            ru: '20 000 контрибуций на всех сервисах',
          },
        ],
      ],
    );
    this.register(
      'development.all-streak',
      summary((all) => all.streak.longest),
      [
        [
          30,
          '🔥',
          { en: 'Not a day without code', ru: 'Ни дня без кода' },
          {
            en: '30 days in a row with a contribution on any service',
            ru: '30 дней подряд с контрибуцией на любом из сервисов',
          },
        ],
        [
          100,
          '🌋',
          { en: 'A hundred days of code', ru: 'Сто дней кода' },
          { en: '100 days in a row on any service', ru: '100 дней подряд на любом из сервисов' },
        ],
        [
          365,
          '☀️',
          { en: 'A year without a gap', ru: 'Год без пропусков' },
          { en: '365 days in a row on any service', ru: '365 дней подряд на любом из сервисов' },
        ],
      ],
    );
  }

  private register(
    id: string,
    measure: (userId: string) => Promise<number>,
    tiers: AchievementTierTuple[],
  ): void {
    this.achievements.register({
      id,
      module: 'development',
      measure,
      tiers: achievementTiers(...tiers),
    });
  }
}
