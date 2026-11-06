import {Injectable, OnModuleInit} from '@nestjs/common';
import {
  AchievementsService,
  achievementTiers,
  AchievementTierTuple,
} from '@pd/api-core';
import {WakatimeDay} from '@pd/contracts';
import {codingTotals, longestCodingStreak} from './coding-stats';
import {WakatimeService} from './wakatime.service';

const HOUR = 3600;
/** A language counts as used once an hour was spent in it. */
const LANGUAGE_MIN_SECONDS = HOUR;
/** As many days as a project needs to be a number of Links (development-metrics.ts). */
const PROJECT_MIN_DAYS = 10;

/** Coding time achievements: hours in total and in a day, days and streaks, languages. */
@Injectable()
export class WakatimeAchievements implements OnModuleInit {
  constructor(
    private readonly achievements: AchievementsService,
    private readonly wakatime: WakatimeService,
  ) {}

  onModuleInit(): void {
    this.registerHours();
    this.registerDays();
    this.registerLanguages();
    this.registerProjects();
  }

  /** Hours of coding: all of them and the best day. */
  private registerHours(): void {
    this.metric(
      'development.coding-hours',
      days => codingTotals(days).totalSeconds / HOUR,
      [
        [
          10,
          '⌨️',
          {en: 'Warmed up', ru: 'Разогрелся'},
          {en: '10 hours of coding', ru: '10 часов кодинга'},
        ],
        [
          100,
          '💻',
          {en: 'A hundred hours of code', ru: 'Сотня часов кода'},
          {en: '100 hours of coding', ru: '100 часов кодинга'},
        ],
        [
          500,
          '🧑‍💻',
          {en: 'Half a thousand', ru: 'Полтысячи'},
          {en: '500 hours of coding', ru: '500 часов кодинга'},
        ],
        [
          1000,
          '🏅',
          {en: 'A thousand hours of code', ru: 'Тысяча часов кода'},
          {en: '1,000 hours of coding', ru: '1 000 часов кодинга'},
        ],
        [
          5000,
          '🧙',
          {en: 'Halfway to mastery', ru: 'Полпути к мастерству'},
          {en: '5,000 hours of coding', ru: '5 000 часов кодинга'},
        ],
      ],
    );
    this.metric(
      'development.coding-day',
      days => (codingTotals(days).bestDay?.seconds ?? 0) / HOUR,
      [
        [
          4,
          '☕',
          {en: 'Heads down', ru: 'С головой в коде'},
          {
            en: '4 hours of coding in one day',
            ru: '4 часа кодинга за один день',
          },
        ],
        [
          8,
          '🌙',
          {en: 'A full shift', ru: 'Полная смена'},
          {
            en: '8 hours of coding in one day',
            ru: '8 часов кодинга за один день',
          },
        ],
        [
          12,
          '🦉',
          {en: 'Code marathon', ru: 'Кодинг-марафон'},
          {
            en: '12 hours of coding in one day',
            ru: '12 часов кодинга за один день',
          },
        ],
      ],
    );
  }

  /** Days with coding: how many and how many in a row. */
  private registerDays(): void {
    this.metric(
      'development.coding-days',
      days => codingTotals(days).activeDays,
      [
        [
          7,
          '📆',
          {en: 'First week', ru: 'Первая неделя'},
          {en: '7 days with coding', ru: '7 дней с кодингом'},
        ],
        [
          30,
          '🗓️',
          {en: 'A month at the keyboard', ru: 'Месяц за клавиатурой'},
          {en: '30 days with coding', ru: '30 дней с кодингом'},
        ],
        [
          100,
          '💯',
          {en: 'A hundred coding days', ru: 'Сто дней за кодом'},
          {en: '100 days with coding', ru: '100 дней с кодингом'},
        ],
        [
          365,
          '🎂',
          {en: 'A year of code', ru: 'Год кода'},
          {en: '365 days with coding', ru: '365 дней с кодингом'},
        ],
      ],
    );
    this.metric(
      'development.coding-streak',
      days => longestCodingStreak(days, this.wakatime.today()),
      [
        [
          7,
          '🔥',
          {en: 'Code without days off', ru: 'Код без выходных'},
          {en: 'Coding 7 days in a row', ru: 'Кодинг 7 дней подряд'},
        ],
        [
          30,
          '⛓️',
          {en: 'Unbroken chain', ru: 'Неразрывная цепь'},
          {en: 'Coding 30 days in a row', ru: 'Кодинг 30 дней подряд'},
        ],
        [
          100,
          '🏔️',
          {en: 'Summit', ru: 'Вершина'},
          {en: 'Coding 100 days in a row', ru: 'Кодинг 100 дней подряд'},
        ],
      ],
    );
  }

  private registerLanguages(): void {
    this.achievements.register({
      id: 'development.coding-languages',
      module: 'development',
      measure: userId =>
        this.wakatime.distinctCount(userId, 'language', LANGUAGE_MIN_SECONDS),
      tiers: achievementTiers(
        [
          3,
          '🗣️',
          {en: 'Trilingual', ru: 'Три языка'},
          {
            en: 'An hour or more in 3 languages',
            ru: 'По часу и больше на 3 языках',
          },
        ],
        [
          5,
          '📖',
          {en: 'Polyglot', ru: 'Полиглот'},
          {
            en: 'An hour or more in 5 languages',
            ru: 'По часу и больше на 5 языках',
          },
        ],
        [
          10,
          '🌍',
          {en: 'Tower of Babel', ru: 'Вавилонская башня'},
          {
            en: 'An hour or more in 10 languages',
            ru: 'По часу и больше на 10 языках',
          },
        ],
      ),
    });
  }

  /** The projects that became numbers of Links of their own: coded in on 10 days or more. */
  private registerProjects(): void {
    this.achievements.register({
      id: 'development.coding-projects',
      module: 'development',
      measure: userId =>
        this.wakatime.namesOnDays(userId, 'project', PROJECT_MIN_DAYS),
      tiers: achievementTiers(
        [
          1,
          '📂',
          {en: 'A project of my own', ru: 'Свой проект'},
          {
            en: `A project coded in on ${PROJECT_MIN_DAYS} days`,
            ru: `Над проектом работал ${PROJECT_MIN_DAYS} дней`,
          },
        ],
        [
          3,
          '🗂️',
          {en: 'Several fronts', ru: 'Несколько фронтов'},
          {
            en: `3 projects coded in on ${PROJECT_MIN_DAYS} days each`,
            ru: `3 проекта, над каждым — ${PROJECT_MIN_DAYS} дней работы`,
          },
        ],
        [
          5,
          '🏭',
          {en: 'A workshop', ru: 'Мастерская'},
          {
            en: `5 projects coded in on ${PROJECT_MIN_DAYS} days each`,
            ru: `5 проектов, над каждым — ${PROJECT_MIN_DAYS} дней работы`,
          },
        ],
      ),
    });
  }

  /** A metric computed from all saved days; a part of an hour does not count. */
  private metric(
    id: string,
    value: (days: WakatimeDay[]) => number,
    tiers: AchievementTierTuple[],
  ): void {
    this.achievements.register({
      id,
      module: 'development',
      measure: async userId =>
        Math.floor(value(await this.wakatime.allDays(userId))),
      tiers: achievementTiers(...tiers),
    });
  }
}
