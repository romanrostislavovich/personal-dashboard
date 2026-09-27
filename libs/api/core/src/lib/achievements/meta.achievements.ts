import { eq } from 'drizzle-orm';
import { Database } from '../database/database.module';
import { AchievementMetric, achievementTier } from './achievement-metric';
import { unlockedAchievements } from './achievements.schema';

/** Module id of the achievements page — meta achievements are shown there. */
const MODULE = 'achievements';

/**
 * Achievements about achievements: how many are unlocked and in how many sections.
 * `metrics()` returns every registered metric, so a module is found by the achievement id.
 */
export function metaAchievementMetrics(
  db: Database,
  metrics: () => readonly AchievementMetric[],
): AchievementMetric[] {
  const unlockedIds = async (userId: string) =>
    (
      await db
        .select({ id: unlockedAchievements.achievementId })
        .from(unlockedAchievements)
        .where(eq(unlockedAchievements.userId, userId))
    ).map((row) => row.id);

  const moduleOf = (achievementId: string) =>
    metrics().find((metric) => achievementId.startsWith(`${metric.id}.`))?.module;

  return [
    {
      id: 'achievements.unlocked',
      module: MODULE,
      measure: async (userId) => (await unlockedIds(userId)).length,
      tiers: [
        achievementTier(
          10,
          '🎖️',
          { en: 'Collector', ru: 'Коллекционер' },
          { en: 'Unlock 10 achievements', ru: 'Открыть 10 ачивок' },
        ),
        achievementTier(
          25,
          '🏵️',
          { en: 'Trophy hunter', ru: 'Охотник за трофеями' },
          { en: 'Unlock 25 achievements', ru: 'Открыть 25 ачивок' },
        ),
        achievementTier(
          50,
          '🗝️',
          { en: 'Completionist', ru: 'Перфекционист' },
          { en: 'Unlock 50 achievements', ru: 'Открыть 50 ачивок' },
        ),
        achievementTier(
          100,
          '🌟',
          { en: 'Living legend', ru: 'Живая легенда' },
          { en: 'Unlock 100 achievements', ru: 'Открыть 100 ачивок' },
        ),
      ],
    },
    {
      id: 'achievements.sections',
      module: MODULE,
      measure: async (userId) => {
        const modules = new Set((await unlockedIds(userId)).map(moduleOf));
        modules.delete(MODULE);
        modules.delete(undefined);
        return modules.size;
      },
      tiers: [
        achievementTier(
          3,
          '🧩',
          { en: 'Well-rounded', ru: 'Разносторонний' },
          {
            en: 'Achievements in 3 different sections',
            ru: 'Ачивки в 3 разных разделах',
          },
        ),
        achievementTier(
          6,
          '🌈',
          { en: 'Renaissance person', ru: 'Человек эпохи Возрождения' },
          {
            en: 'Achievements in 6 different sections',
            ru: 'Ачивки в 6 разных разделах',
          },
        ),
      ],
    },
  ];
}
