import { Injectable, OnModuleInit } from '@nestjs/common';
import { AchievementsService, achievementTiers, AchievementTierTuple } from '@pd/api-core';
import { DotaCareer, DotaCareerService } from './dota-career.service';

/** Dota 2 achievements computed from the saved match history (every game mode). */
@Injectable()
export class DotaAchievements implements OnModuleInit {
  constructor(
    private readonly achievements: AchievementsService,
    private readonly career: DotaCareerService,
  ) {}

  onModuleInit(): void {
    this.registerMatchCounts();
    this.registerModeWins();
    this.registerHeroes();
    this.registerFightRecords();
    this.registerFarmRecords();
    this.registerTimeRecords();
  }

  /** Matches, wins and the best streak. */
  private registerMatchCounts(): void {
    this.metric('games.dota-matches', 'matches', [
      [
        10,
        '🎮',
        { en: 'Rookie', ru: 'Новобранец' },
        { en: '10 Dota 2 matches', ru: '10 матчей в Dota 2' },
      ],
      [100, '🕹️', { en: 'Regular', ru: 'Завсегдатай' }, { en: '100 matches', ru: '100 матчей' }],
      [
        1000,
        '🏟️',
        { en: 'Thousand battles', ru: 'Тысяча битв' },
        { en: '1,000 matches', ru: '1 000 матчей' },
      ],
      [
        5000,
        '🧙',
        { en: 'Dota is life', ru: 'Жизнь в Доте' },
        { en: '5,000 matches', ru: '5 000 матчей' },
      ],
    ]);
    // Ids of existing metrics stay the same, so unlocked achievements are kept.
    this.metric('games.dota-wins', 'wins', [
      [
        10,
        '⚔️',
        { en: 'First blood', ru: 'Первая кровь' },
        { en: '10 wins in Dota 2', ru: '10 побед в Dota 2' },
      ],
      [
        100,
        '🗡️',
        { en: 'Veteran', ru: 'Ветеран' },
        { en: '100 wins in Dota 2', ru: '100 побед в Dota 2' },
      ],
      [
        500,
        '🐉',
        { en: 'Arena legend', ru: 'Легенда арены' },
        { en: '500 wins in Dota 2', ru: '500 побед в Dota 2' },
      ],
      [
        1000,
        '🌋',
        { en: 'Throne breaker', ru: 'Разрушитель трона' },
        { en: '1,000 wins in Dota 2', ru: '1 000 побед в Dota 2' },
      ],
    ]);
    this.metric('games.dota-win-streak', 'longestWinStreak', [
      [5, '🔥', { en: 'Streak', ru: 'Серия' }, { en: '5 wins in a row', ru: '5 побед подряд' }],
      [
        10,
        '☄️',
        { en: 'Unstoppable', ru: 'Неудержимый' },
        { en: '10 wins in a row', ru: '10 побед подряд' },
      ],
    ]);
  }

  /** Wins in Turbo and ranked games. */
  private registerModeWins(): void {
    this.metric('games.dota-turbo-wins', 'turboWins', [
      [10, '⚡', { en: 'Turbo', ru: 'Турбо' }, { en: '10 Turbo wins', ru: '10 побед в Турбо' }],
      [100, '🏎️', { en: 'Nitro', ru: 'Нитро' }, { en: '100 Turbo wins', ru: '100 побед в Турбо' }],
      [
        500,
        '🚀',
        { en: 'Warp speed', ru: 'Варп-скорость' },
        { en: '500 Turbo wins', ru: '500 побед в Турбо' },
      ],
    ]);
    this.metric('games.dota-ranked-wins', 'rankedWins', [
      [
        10,
        '🎯',
        { en: 'Ranked', ru: 'Рейтинговый' },
        { en: '10 ranked wins', ru: '10 рейтинговых побед' },
      ],
      [
        100,
        '🥋',
        { en: 'Grinder', ru: 'Гриндер' },
        { en: '100 ranked wins', ru: '100 рейтинговых побед' },
      ],
    ]);
  }

  /** How many heroes, and how much on one hero. */
  private registerHeroes(): void {
    this.metric('games.dota-heroes', 'heroesPlayed', [
      [
        10,
        '🎭',
        { en: 'Many faces', ru: 'Многоликий' },
        { en: '10 different heroes', ru: '10 разных героев' },
      ],
      [
        50,
        '🃏',
        { en: 'Versatile', ru: 'Универсал' },
        { en: '50 different heroes', ru: '50 разных героев' },
      ],
      [
        100,
        '🦸',
        { en: 'Hero collector', ru: 'Коллекционер героев' },
        { en: '100 different heroes', ru: '100 разных героев' },
      ],
    ]);
    this.metric('games.dota-hero-games', 'maxGamesOnHero', [
      [
        50,
        '💞',
        { en: 'Main', ru: 'Мейнер' },
        { en: '50 matches on one hero', ru: '50 матчей на одном герое' },
      ],
      [
        200,
        '🤝',
        { en: 'One with the hero', ru: 'Единое целое' },
        { en: '200 matches on one hero', ru: '200 матчей на одном герое' },
      ],
      [
        500,
        '🧬',
        { en: 'Hero spammer', ru: 'Спамер героя' },
        { en: '500 matches on one hero', ru: '500 матчей на одном герое' },
      ],
    ]);
  }

  /** Best single match: kills, assists, a win without dying. */
  private registerFightRecords(): void {
    this.metric('games.dota-max-kills', 'maxKills', [
      [
        15,
        '💀',
        { en: 'Killing spree', ru: 'Серия убийств' },
        { en: '15 kills in a match', ru: '15 убийств за матч' },
      ],
      [
        25,
        '☠️',
        { en: 'Godlike', ru: 'Божественно' },
        { en: '25 kills in a match', ru: '25 убийств за матч' },
      ],
      [
        35,
        '🩸',
        { en: 'Beyond godlike', ru: 'За гранью' },
        { en: '35 kills in a match', ru: '35 убийств за матч' },
      ],
    ]);
    this.metric('games.dota-max-assists', 'maxAssists', [
      [
        25,
        '🤲',
        { en: 'Team player', ru: 'Командный игрок' },
        { en: '25 assists in a match', ru: '25 помощи за матч' },
      ],
      [
        40,
        '🫶',
        { en: 'Heart of the team', ru: 'Душа команды' },
        { en: '40 assists in a match', ru: '40 помощи за матч' },
      ],
    ]);
    this.metric('games.dota-flawless', 'flawlessWins', [
      [
        1,
        '🛡️',
        { en: 'Untouchable', ru: 'Неприкасаемый' },
        { en: 'Win without dying', ru: 'Победа без единой смерти' },
      ],
      [
        10,
        '🧊',
        { en: 'Ice cold', ru: 'Хладнокровный' },
        { en: '10 wins without dying', ru: '10 побед без смертей' },
      ],
    ]);
  }

  /** Best single match: gold per minute, hero damage, last hits. */
  private registerFarmRecords(): void {
    this.metric('games.dota-max-gpm', 'maxGoldPerMin', [
      [
        700,
        '💰',
        { en: 'Farmer', ru: 'Фармила' },
        { en: '700 GPM in a match', ru: '700 золота в минуту' },
      ],
      [
        1000,
        '🏦',
        { en: 'Gold rush', ru: 'Золотая лихорадка' },
        { en: '1,000 GPM in a match', ru: '1 000 золота в минуту' },
      ],
    ]);
    this.metric('games.dota-max-damage', 'maxHeroDamage', [
      [
        50_000,
        '💥',
        { en: 'Nuker', ru: 'Нюкер' },
        { en: '50,000 hero damage in a match', ru: '50 000 урона по героям' },
      ],
      [
        80_000,
        '🌪️',
        { en: 'Devastator', ru: 'Опустошитель' },
        { en: '80,000 hero damage in a match', ru: '80 000 урона по героям' },
      ],
    ]);
    this.metric('games.dota-max-last-hits', 'maxLastHits', [
      [
        400,
        '🌾',
        { en: 'Last hit master', ru: 'Мастер добиваний' },
        { en: '400 last hits in a match', ru: '400 добиваний за матч' },
      ],
      [
        700,
        '🚜',
        { en: 'Harvester', ru: 'Комбайн' },
        { en: '700 last hits in a match', ru: '700 добиваний за матч' },
      ],
    ]);
  }

  /** Long and fast matches, and years in the game. */
  private registerTimeRecords(): void {
    this.metric('games.dota-marathon', 'longestMatchMin', [
      [
        60,
        '⏳',
        { en: 'Marathon', ru: 'Марафон' },
        { en: 'A 60-minute match', ru: 'Матч на 60 минут' },
      ],
      [
        90,
        '🕰️',
        { en: 'Endless game', ru: 'Бесконечная игра' },
        { en: 'A 90-minute match', ru: 'Матч на 90 минут' },
      ],
    ]);
    this.metric('games.dota-fast-wins', 'fastWins', [
      [
        1,
        '🏃',
        { en: 'Speedrun', ru: 'Спидран' },
        { en: 'Win in under 20 minutes (not Turbo)', ru: 'Победа быстрее 20 минут (не Турбо)' },
      ],
      [
        10,
        '⏱️',
        { en: 'Blitz', ru: 'Блиц' },
        { en: '10 wins in under 20 minutes', ru: '10 побед быстрее 20 минут' },
      ],
    ]);
    this.metric('games.dota-years', 'yearsSinceFirstMatch', [
      [
        1,
        '🎂',
        { en: 'Anniversary', ru: 'Годовщина' },
        { en: 'A year since the first match', ru: 'Год с первого матча' },
      ],
      [
        5,
        '🧓',
        { en: 'Old-timer', ru: 'Старожил' },
        { en: '5 years since the first match', ru: '5 лет с первого матча' },
      ],
      [
        10,
        '🏛️',
        { en: 'Decade of Dota', ru: 'Десятилетие в Доте' },
        { en: '10 years since the first match', ru: '10 лет с первого матча' },
      ],
    ]);
  }

  private metric(id: string, field: keyof DotaCareer, tiers: AchievementTierTuple[]): void {
    this.achievements.register({
      id,
      module: 'games',
      measure: async (userId) => (await this.career.career(userId))[field],
      tiers: achievementTiers(...tiers),
    });
  }
}
