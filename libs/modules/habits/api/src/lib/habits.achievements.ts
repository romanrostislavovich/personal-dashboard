import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  AchievementsService,
  achievementTiers,
  AchievementTierTuple,
  LocalizedText,
} from '@pd/api-core';
import { Habit, HabitKind } from '@pd/contracts';
import { HabitsService } from './habits.service';

/** The days in a row of a streak, from a day to almost three years. */
const STREAK_GOALS = [1, 7, 30, 90, 180, 365, 1000] as const;

/** What a streak of each kind is called, and its icons. */
const STREAKS: Record<HabitKind, { what: LocalizedText; icons: string[] }> = {
  alcohol: {
    what: { en: 'without alcohol', ru: 'без алкоголя' },
    icons: ['🌱', '🍃', '🌿', '🌳', '🏞️', '🏔️', '👑'],
  },
  smoking: {
    what: { en: 'without smoking', ru: 'без сигарет' },
    icons: ['🫁', '🌬️', '🍀', '🌲', '🏃', '🏅', '🦅'],
  },
  custom: {
    what: { en: 'without a habit you quit', ru: 'без привычки, которую бросаешь' },
    icons: ['✨', '⭐', '🌟', '💫', '🌠', '🌌', '🪐'],
  },
};

const STREAK_TITLES: LocalizedText[] = [
  { en: 'The first day', ru: 'Первый день' },
  { en: 'A week', ru: 'Неделя' },
  { en: 'A month', ru: 'Месяц' },
  { en: 'Three months', ru: 'Три месяца' },
  { en: 'Half a year', ru: 'Полгода' },
  { en: 'A year', ru: 'Год' },
  { en: 'A thousand days', ru: 'Тысяча дней' },
];

/**
 * Habit achievements: the longest run of clean days of each kind — alcohol, smoking, one's
 * own — and, for cutting down, weeks within the limit and clean days of the year. A day with it
 * starts the run again, but an achievement once unlocked stays: a slip takes nothing away.
 */
@Injectable()
export class HabitsAchievements implements OnModuleInit {
  constructor(
    private readonly achievements: AchievementsService,
    private readonly habits: HabitsService,
  ) {}

  onModuleInit(): void {
    for (const kind of ['alcohol', 'smoking', 'custom'] as const) {
      this.achievements.register({
        id: `habits.${kind}-streak`,
        module: 'habits',
        measure: async (userId) =>
          best(await this.habits.list(userId), kind, (habit) => habit.stats.bestStreak),
        tiers: achievementTiers(
          ...STREAK_GOALS.map((goal, index) => streakTier(kind, goal, index)),
        ),
      });
    }

    this.achievements.register({
      id: 'habits.weeks-within-limit',
      module: 'habits',
      measure: async (userId) =>
        best(await this.habits.list(userId), null, (habit) => habit.stats.weeksWithinLimit),
      tiers: achievementTiers(
        [
          4,
          '📉',
          { en: 'Cutting down', ru: 'Меньше' },
          {
            en: '4 weeks in a row within your limit of days',
            ru: '4 недели подряд в рамках своего лимита дней',
          },
        ],
        [
          12,
          '🎚️',
          { en: 'In control', ru: 'Под контролем' },
          {
            en: '12 weeks in a row within your limit of days',
            ru: '12 недель подряд в рамках своего лимита дней',
          },
        ],
        [
          52,
          '🧘',
          { en: 'A year of measure', ru: 'Год меры' },
          {
            en: '52 weeks in a row within your limit of days',
            ru: '52 недели подряд в рамках своего лимита дней',
          },
        ],
      ),
    });

    this.achievements.register({
      id: 'habits.clean-days-year',
      module: 'habits',
      measure: async (userId) =>
        best(await this.habits.list(userId), null, (habit) => habit.stats.cleanDaysThisYear),
      tiers: achievementTiers(
        [
          100,
          '🗓️',
          { en: 'A hundred clean days', ru: 'Сто чистых дней' },
          {
            en: '100 clean days of one habit in a year',
            ru: '100 чистых дней одной привычки за год',
          },
        ],
        [
          200,
          '📆',
          { en: 'Two hundred clean days', ru: 'Двести чистых дней' },
          {
            en: '200 clean days of one habit in a year',
            ru: '200 чистых дней одной привычки за год',
          },
        ],
        [
          300,
          '🌞',
          { en: 'A clean year', ru: 'Чистый год' },
          {
            en: '300 clean days of one habit in a year',
            ru: '300 чистых дней одной привычки за год',
          },
        ],
      ),
    });
  }
}

/** The highest number among the habits (of one kind). */
function best(habits: Habit[], kind: HabitKind | null, value: (habit: Habit) => number): number {
  return Math.max(0, ...habits.filter((habit) => !kind || habit.kind === kind).map(value));
}

function streakTier(kind: HabitKind, goal: number, index: number): AchievementTierTuple {
  const { what, icons } = STREAKS[kind];
  const title = STREAK_TITLES[index];
  return [
    goal,
    icons[index],
    { en: `${title.en} ${what.en}`, ru: `${title.ru} ${what.ru}` },
    {
      en: `${goal} ${goal === 1 ? 'day' : 'days'} in a row ${what.en}`,
      ru: `${goal} ${daysRu(goal)} подряд ${what.ru}`,
    },
  ];
}

function daysRu(count: number): string {
  const last = count % 10;
  const lastTwo = count % 100;
  if (last === 1 && lastTwo !== 11) {
    return 'день';
  }
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? 'дня' : 'дней';
}
