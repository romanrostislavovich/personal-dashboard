import { Injectable, OnModuleInit } from '@nestjs/common';
import { AchievementsService, achievementTiers, AchievementTierTuple } from '@pd/api-core';
import { ActivityCategory } from '@pd/contracts';
import { ActivityAllTime, ActivityService } from './activity.service';
import { WellbeingService } from './wellbeing.service';

const HOUR = 3600;
/** One check measures every metric: they share the numbers instead of asking again each. */
const RECORDS_FRESH_MS = 30_000;

const hours = (seconds: number) => Math.floor(seconds / HOUR);
const inCategory = (category: ActivityCategory) => (records: ActivityAllTime) =>
  hours(records.byCategory.get(category) ?? 0);

/**
 * Achievements of the Activity section: hours recorded in total and on what, days and streaks,
 * long days, the time of day, projects and programs.
 */
@Injectable()
export class ActivityAchievements implements OnModuleInit {
  private readonly fresh = new Map<string, { at: number; records: Promise<ActivityAllTime> }>();

  constructor(
    private readonly achievements: AchievementsService,
    private readonly activity: ActivityService,
    private readonly wellbeing: WellbeingService,
  ) {}

  onModuleInit(): void {
    this.metric('activity.hours', (records) => hours(records.totalSeconds), [
      [
        1,
        '👀',
        { en: 'Being watched', ru: 'Под присмотром' },
        { en: 'The first hour at the computer recorded', ru: 'Записан первый час за компьютером' },
      ],
      [
        10,
        '🖥️',
        { en: 'On the record', ru: 'Под запись' },
        { en: '10 hours at the computer recorded', ru: 'Записано 10 часов за компьютером' },
      ],
      [
        100,
        '⌨️',
        { en: 'A hundred hours', ru: 'Сотня часов' },
        { en: '100 hours at the computer', ru: '100 часов за компьютером' },
      ],
      [
        500,
        '🪑',
        { en: 'Worn-out chair', ru: 'Просиженное кресло' },
        { en: '500 hours at the computer', ru: '500 часов за компьютером' },
      ],
      [
        1000,
        '🕰️',
        { en: 'A thousand hours', ru: 'Тысяча часов' },
        { en: '1,000 hours at the computer', ru: '1 000 часов за компьютером' },
      ],
      [
        5000,
        '🧙',
        { en: 'One with the machine', ru: 'Единое целое с машиной' },
        { en: '5,000 hours at the computer', ru: '5 000 часов за компьютером' },
      ],
    ]);

    this.metric('activity.days', (records) => records.activeDays, [
      [
        7,
        '📅',
        { en: 'A week of records', ru: 'Неделя записей' },
        { en: '7 days with recorded activity', ru: '7 дней с записанной активностью' },
      ],
      [
        30,
        '🗓️',
        { en: 'A month of records', ru: 'Месяц записей' },
        { en: '30 days with recorded activity', ru: '30 дней с записанной активностью' },
      ],
      [
        100,
        '📚',
        { en: 'A hundred days', ru: 'Сто дней' },
        { en: '100 days with recorded activity', ru: '100 дней с записанной активностью' },
      ],
      [
        365,
        '🎂',
        { en: 'A year on the record', ru: 'Год под запись' },
        { en: '365 days with recorded activity', ru: '365 дней с записанной активностью' },
      ],
    ]);

    this.metric('activity.streak', (records) => records.longestStreak, [
      [
        7,
        '🔥',
        { en: 'Not a day off', ru: 'Ни дня без компьютера' },
        { en: '7 days in a row at the computer', ru: '7 дней подряд за компьютером' },
      ],
      [
        30,
        '⚡',
        { en: 'Always online', ru: 'Всегда на связи' },
        { en: '30 days in a row at the computer', ru: '30 дней подряд за компьютером' },
      ],
      [
        100,
        '🌋',
        { en: 'Time for a holiday', ru: 'Пора в отпуск' },
        { en: '100 days in a row at the computer', ru: '100 дней подряд за компьютером' },
      ],
    ]);

    this.metric('activity.day-hours', (records) => hours(records.bestDaySeconds), [
      [
        6,
        '☕',
        { en: 'A full day', ru: 'Полный день' },
        { en: '6 hours at the computer in one day', ru: '6 часов за компьютером за один день' },
      ],
      [
        10,
        '🏃',
        { en: 'Marathon', ru: 'Марафон' },
        { en: '10 hours at the computer in one day', ru: '10 часов за компьютером за один день' },
      ],
      [
        14,
        '🧟',
        { en: 'Go to sleep', ru: 'Иди спать' },
        { en: '14 hours at the computer in one day', ru: '14 часов за компьютером за один день' },
      ],
    ]);

    this.metric('activity.development-hours', inCategory('development'), [
      [
        10,
        '🧑‍💻',
        { en: 'Hello, world', ru: 'Hello, world' },
        { en: '10 hours in development tools', ru: '10 часов в инструментах разработки' },
      ],
      [
        50,
        '👨‍💻',
        { en: 'In the editor', ru: 'В редакторе' },
        { en: '50 hours in development tools', ru: '50 часов в инструментах разработки' },
      ],
      [
        500,
        '🧑‍🔬',
        { en: 'Deep work', ru: 'Глубокая работа' },
        { en: '500 hours in development tools', ru: '500 часов в инструментах разработки' },
      ],
      [
        2000,
        '🏛️',
        { en: 'A year of full-time code', ru: 'Год кода на полную ставку' },
        { en: '2,000 hours in development tools', ru: '2 000 часов в инструментах разработки' },
      ],
    ]);

    this.metric('activity.development-day', (records) => hours(records.bestDevelopmentDaySeconds), [
      [
        4,
        '🎯',
        { en: 'In the flow', ru: 'В потоке' },
        {
          en: '4 hours in development tools in one day',
          ru: '4 часа в инструментах разработки за один день',
        },
      ],
      [
        8,
        '🚀',
        { en: 'Crunch', ru: 'Кранч' },
        {
          en: '8 hours in development tools in one day',
          ru: '8 часов в инструментах разработки за один день',
        },
      ],
    ]);

    this.metric('activity.project-hours', (records) => hours(records.projectSeconds), [
      [
        10,
        '📌',
        { en: 'On the project', ru: 'По делу' },
        { en: '10 hours in the windows of your projects', ru: '10 часов в окнах своих проектов' },
      ],
      [
        100,
        '🏗️',
        { en: 'Builder', ru: 'Строитель' },
        { en: '100 hours in the windows of your projects', ru: '100 часов в окнах своих проектов' },
      ],
      [
        500,
        '🏰',
        { en: 'Founder', ru: 'Основатель' },
        { en: '500 hours in the windows of your projects', ru: '500 часов в окнах своих проектов' },
      ],
    ]);

    this.metric('activity.games-hours', inCategory('games'), [
      [
        10,
        '🕹️',
        { en: 'Just one more', ru: 'Ещё одну катку' },
        { en: '10 hours in games', ru: '10 часов в играх' },
      ],
      [
        100,
        '🎮',
        { en: 'Player', ru: 'Игрок' },
        { en: '100 hours in games', ru: '100 часов в играх' },
      ],
      [
        500,
        '🐲',
        { en: 'No-lifer', ru: 'Задрот' },
        { en: '500 hours in games', ru: '500 часов в играх' },
      ],
      [
        1000,
        '👾',
        { en: 'The second life', ru: 'Вторая жизнь' },
        { en: '1,000 hours in games', ru: '1 000 часов в играх' },
      ],
    ]);

    this.metric('activity.communication-hours', inCategory('communication'), [
      [
        10,
        '💬',
        { en: 'Chatty', ru: 'Разговорчивый' },
        { en: '10 hours in messengers and mail', ru: '10 часов в мессенджерах и почте' },
      ],
      [
        100,
        '📣',
        { en: 'The soul of the chat', ru: 'Душа чата' },
        { en: '100 hours in messengers and mail', ru: '100 часов в мессенджерах и почте' },
      ],
    ]);

    this.metric('activity.browsing-hours', inCategory('browsing'), [
      [
        50,
        '🌐',
        { en: 'Surfer', ru: 'Сёрфер' },
        { en: '50 hours in the browser', ru: '50 часов в браузере' },
      ],
      [
        500,
        '🕸️',
        { en: 'Lives on the web', ru: 'Живёт в интернете' },
        { en: '500 hours in the browser', ru: '500 часов в браузере' },
      ],
    ]);

    this.metric('activity.media-hours', inCategory('media'), [
      [
        10,
        '🍿',
        { en: 'Popcorn', ru: 'Попкорн' },
        { en: '10 hours in players', ru: '10 часов в плеерах' },
      ],
      [
        100,
        '🎬',
        { en: 'Film buff', ru: 'Киноман' },
        { en: '100 hours in players', ru: '100 часов в плеерах' },
      ],
    ]);

    this.metric('activity.office-hours', inCategory('office'), [
      [
        10,
        '📝',
        { en: 'Paperwork', ru: 'Бумажная работа' },
        { en: '10 hours in documents and notes', ru: '10 часов в документах и заметках' },
      ],
      [
        100,
        '🗂️',
        { en: 'Clerk', ru: 'Канцелярист' },
        { en: '100 hours in documents and notes', ru: '100 часов в документах и заметках' },
      ],
    ]);

    this.metric('activity.design-hours', inCategory('design'), [
      [
        10,
        '🎨',
        { en: 'Move it two pixels', ru: 'Подвинь на два пикселя' },
        { en: '10 hours in design tools', ru: '10 часов в инструментах дизайна' },
      ],
      [
        100,
        '🖌️',
        { en: 'Artist', ru: 'Художник' },
        { en: '100 hours in design tools', ru: '100 часов в инструментах дизайна' },
      ],
    ]);

    this.metric('activity.night-hours', (records) => hours(records.nightSeconds), [
      [
        10,
        '🦉',
        { en: 'Night owl', ru: 'Сова' },
        {
          en: '10 hours at the computer between midnight and 5 a.m.',
          ru: '10 часов за компьютером с полуночи до 5 утра',
        },
      ],
      [
        100,
        '🌙',
        { en: 'The night shift', ru: 'Ночная смена' },
        {
          en: '100 hours at the computer between midnight and 5 a.m.',
          ru: '100 часов за компьютером с полуночи до 5 утра',
        },
      ],
    ]);

    this.metric('activity.early-hours', (records) => hours(records.earlySeconds), [
      [
        10,
        '🐦',
        { en: 'Early bird', ru: 'Жаворонок' },
        {
          en: '10 hours at the computer between 5 and 8 a.m.',
          ru: '10 часов за компьютером с 5 до 8 утра',
        },
      ],
      [
        100,
        '🌅',
        { en: 'Up before the sun', ru: 'Раньше солнца' },
        {
          en: '100 hours at the computer between 5 and 8 a.m.',
          ru: '100 часов за компьютером с 5 до 8 утра',
        },
      ],
    ]);

    this.metric('activity.weekend-hours', (records) => hours(records.weekendSeconds), [
      [
        20,
        '🛋️',
        { en: 'What weekend?', ru: 'Какие ещё выходные' },
        { en: '20 hours at the computer on weekends', ru: '20 часов за компьютером по выходным' },
      ],
      [
        200,
        '🏝️',
        { en: 'No days off', ru: 'Без выходных' },
        { en: '200 hours at the computer on weekends', ru: '200 часов за компьютером по выходным' },
      ],
    ]);

    this.metric('activity.apps', (records) => records.apps, [
      [
        10,
        '🧰',
        { en: 'Toolbox', ru: 'Набор инструментов' },
        { en: '10 different programs used', ru: '10 разных программ' },
      ],
      [
        30,
        '🗃️',
        { en: 'A program for everything', ru: 'На всё своя программа' },
        { en: '30 different programs used', ru: '30 разных программ' },
      ],
      [
        75,
        '🧪',
        { en: 'Tried it all', ru: 'Перепробовал всё' },
        { en: '75 different programs used', ru: '75 разных программ' },
      ],
    ]);

    this.focusMetric('activity.focus-sessions', (records) => records.sessions, [
      [
        1,
        '🍅',
        { en: 'The first tomato', ru: 'Первый помидор' },
        { en: 'The first focus session completed', ru: 'Первая завершённая фокус-сессия' },
      ],
      [
        25,
        '🎯',
        { en: 'Focused', ru: 'Собранный' },
        { en: '25 focus sessions completed', ru: '25 завершённых фокус-сессий' },
      ],
      [
        100,
        '🧘',
        { en: 'Zen', ru: 'Дзен' },
        { en: '100 focus sessions completed', ru: '100 завершённых фокус-сессий' },
      ],
      [
        500,
        '🥷',
        { en: 'Master of attention', ru: 'Мастер внимания' },
        { en: '500 focus sessions completed', ru: '500 завершённых фокус-сессий' },
      ],
    ]);

    this.focusMetric('activity.focus-hours', (records) => hours(records.seconds), [
      [
        10,
        '⏱️',
        { en: 'Ten hours of focus', ru: 'Десять часов фокуса' },
        { en: '10 hours in focus sessions', ru: '10 часов в фокус-сессиях' },
      ],
      [
        100,
        '🔭',
        { en: 'Deep focus', ru: 'Глубокое погружение' },
        { en: '100 hours in focus sessions', ru: '100 часов в фокус-сессиях' },
      ],
    ]);

    this.focusMetric('activity.focus-streak', (records) => records.longestStreak, [
      [
        5,
        '🔥',
        { en: 'Focus habit', ru: 'Привычка к фокусу' },
        { en: 'A focus session 5 days in a row', ru: 'Фокус-сессия 5 дней подряд' },
      ],
      [
        30,
        '🏔️',
        { en: 'Unbreakable', ru: 'Несгибаемый' },
        { en: 'A focus session 30 days in a row', ru: 'Фокус-сессия 30 дней подряд' },
      ],
    ]);

    this.metric('activity.devices', (records) => records.devices, [
      [
        2,
        '💻',
        { en: 'On two chairs', ru: 'На двух стульях' },
        { en: 'Activity is tracked on 2 devices', ru: 'Активность отслеживается на 2 устройствах' },
      ],
    ]);
  }

  private metric(
    id: string,
    value: (records: ActivityAllTime) => number,
    tiers: AchievementTierTuple[],
  ): void {
    this.achievements.register({
      id,
      module: 'activity',
      measure: async (userId) => value(await this.records(userId)),
      tiers: achievementTiers(...tiers),
    });
  }

  private focusMetric(
    id: string,
    value: (records: { sessions: number; seconds: number; longestStreak: number }) => number,
    tiers: AchievementTierTuple[],
  ): void {
    this.achievements.register({
      id,
      module: 'activity',
      measure: async (userId) => value(await this.wellbeing.focusRecords(userId)),
      tiers: achievementTiers(...tiers),
    });
  }

  private records(userId: string): Promise<ActivityAllTime> {
    const known = this.fresh.get(userId);
    if (known && Date.now() - known.at < RECORDS_FRESH_MS) {
      return known.records;
    }
    const records = this.activity.records(userId);
    this.fresh.set(userId, { at: Date.now(), records });
    // A failed reading is not kept: the next metric asks again.
    records.catch(() => this.fresh.delete(userId));
    return records;
  }
}
