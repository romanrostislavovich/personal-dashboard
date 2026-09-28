import { computeStreaks, daysBetween, parseLocalDate, todayIn, toLocalDate } from '@pd/contracts';
import { eq } from 'drizzle-orm';
import { aiConnections } from '../ai/ai.schema';
import { Database } from '../database/database.module';
import { projects } from '../projects/projects.schema';
import { userSecrets } from '../secrets/secrets.schema';
import { users } from '../users/users.schema';
import { AchievementMetric, achievementTiers } from './achievement-metric';
import { activeDays } from './active-days.schema';

/** Shown under "Home" on the achievements page (translation key `dashboard.title`). */
const MODULE = 'dashboard';

/** Records today as an active day of the user; repeated calls within a day do nothing. */
export async function markActiveDay(db: Database, userId: string, timeZone: string) {
  await db
    .insert(activeDays)
    .values({ userId, day: toLocalDate(todayIn(timeZone)) })
    .onConflictDoNothing();
}

/**
 * Achievements about the dashboard itself: how long and how often it is used,
 * what is connected to it. Everything is measured from core tables.
 */
export function dashboardAchievementMetrics(db: Database, timeZone: string): AchievementMetric[] {
  const visitedDays = async (userId: string) =>
    (
      await db.select({ day: activeDays.day }).from(activeDays).where(eq(activeDays.userId, userId))
    ).map((row) => row.day);

  return [
    {
      id: 'dashboard.age',
      module: MODULE,
      measure: async (userId) => {
        const [user] = await db
          .select({ createdAt: users.createdAt })
          .from(users)
          .where(eq(users.id, userId));
        return user ? daysBetween(todayIn(timeZone, user.createdAt), todayIn(timeZone)) : 0;
      },
      tiers: achievementTiers(
        [
          7,
          '🏠',
          { en: 'Housewarming', ru: 'Новоселье' },
          { en: 'A week with the dashboard', ru: 'Неделя с дашбордом' },
        ],
        [
          30,
          '🛋️',
          { en: 'Settled in', ru: 'Обжился' },
          { en: 'A month with the dashboard', ru: 'Месяц с дашбордом' },
        ],
        [
          100,
          '🕯️',
          { en: 'Old-timer', ru: 'Старожил' },
          { en: '100 days with the dashboard', ru: '100 дней с дашбордом' },
        ],
        [
          365,
          '🎂',
          { en: 'First anniversary', ru: 'Первая годовщина' },
          { en: 'A year with the dashboard', ru: 'Год с дашбордом' },
        ],
      ),
    },
    {
      id: 'dashboard.active-days',
      module: MODULE,
      measure: async (userId) => (await visitedDays(userId)).length,
      tiers: achievementTiers(
        [
          10,
          '👀',
          { en: 'Dropping by', ru: 'Заглядываю' },
          { en: 'Use the dashboard on 10 days', ru: 'Пользоваться дашбордом 10 дней' },
        ],
        [
          50,
          '☕',
          { en: 'Morning ritual', ru: 'Утренний ритуал' },
          { en: 'Use the dashboard on 50 days', ru: 'Пользоваться дашбордом 50 дней' },
        ],
        [
          150,
          '🧭',
          { en: 'Control center', ru: 'Центр управления' },
          { en: 'Use the dashboard on 150 days', ru: 'Пользоваться дашбордом 150 дней' },
        ],
        [
          365,
          '🏰',
          { en: 'Home base', ru: 'Родная гавань' },
          { en: 'Use the dashboard on 365 days', ru: 'Пользоваться дашбордом 365 дней' },
        ],
      ),
    },
    {
      id: 'dashboard.visit-streak',
      module: MODULE,
      measure: async (userId) =>
        computeStreaks(await visitedDays(userId), todayIn(timeZone)).longest,
      tiers: achievementTiers(
        [
          7,
          '⚡',
          { en: 'Finger on the pulse', ru: 'Руку на пульсе' },
          { en: 'Use the dashboard 7 days in a row', ru: 'Пользоваться дашбордом 7 дней подряд' },
        ],
        [
          30,
          '🔁',
          { en: 'Habit formed', ru: 'Привычка' },
          {
            en: 'Use the dashboard 30 days in a row',
            ru: 'Пользоваться дашбордом 30 дней подряд',
          },
        ],
        [
          100,
          '🛡️',
          { en: 'Unbreakable', ru: 'Несгибаемый' },
          {
            en: 'Use the dashboard 100 days in a row',
            ru: 'Пользоваться дашбордом 100 дней подряд',
          },
        ],
      ),
    },
    {
      // Every stored secret is one connected service: a GitHub token, a Last.fm key, an AI key…
      id: 'dashboard.integrations',
      module: MODULE,
      measure: (userId) => db.$count(userSecrets, eq(userSecrets.userId, userId)),
      tiers: achievementTiers(
        [
          1,
          '🔌',
          { en: 'Plugged in', ru: 'Подключено' },
          { en: 'Connect the first integration', ru: 'Подключить первую интеграцию' },
        ],
        [
          3,
          '🔗',
          { en: 'All connected', ru: 'Всё связано' },
          { en: 'Connect 3 integrations', ru: 'Подключить 3 интеграции' },
        ],
        [
          6,
          '🕸️',
          { en: 'Hub', ru: 'Узел связи' },
          { en: 'Connect 6 integrations', ru: 'Подключить 6 интеграций' },
        ],
      ),
    },
    {
      id: 'dashboard.projects',
      module: MODULE,
      measure: (userId) => db.$count(projects, eq(projects.userId, userId)),
      tiers: achievementTiers(
        [
          1,
          '🚀',
          { en: 'First project', ru: 'Первый проект' },
          { en: 'Add a project', ru: 'Добавить проект' },
        ],
        [
          5,
          '🗂️',
          { en: 'Portfolio', ru: 'Портфолио' },
          { en: 'Add 5 projects', ru: 'Добавить 5 проектов' },
        ],
      ),
    },
    {
      id: 'dashboard.telegram',
      module: MODULE,
      measure: async (userId) => {
        const [user] = await db
          .select({ chatId: users.telegramChatId })
          .from(users)
          .where(eq(users.id, userId));
        return user?.chatId ? 1 : 0;
      },
      tiers: achievementTiers([
        1,
        '📨',
        { en: 'On the line', ru: 'На связи' },
        { en: 'Connect the Telegram bot', ru: 'Подключить Telegram-бота' },
      ]),
    },
    {
      id: 'dashboard.ai',
      module: MODULE,
      measure: (userId) => db.$count(aiConnections, eq(aiConnections.userId, userId)),
      tiers: achievementTiers([
        1,
        '🤖',
        { en: 'Copilot', ru: 'Второй пилот' },
        { en: 'Connect an AI model', ru: 'Подключить AI-модель' },
      ]),
    },
  ];
}
