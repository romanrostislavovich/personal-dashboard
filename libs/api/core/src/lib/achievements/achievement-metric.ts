import { LocalizedText } from '../i18n/locale';

export type { LocalizedText };

export interface AchievementTier {
  /** Metric threshold at which the achievement unlocks. */
  goal: number;
  icon: string;
  title: LocalizedText;
  description: LocalizedText;
}

/**
 * A metric and its tiers. A module registers metrics in `onModuleInit`:
 *
 * ```ts
 * achievements.register({
 *   id: 'diary.longest-streak',
 *   module: 'diary',
 *   measure: (userId) => this.diary.longestStreak(userId),
 *   tiers: [
 *     { goal: 7, icon: '🔥', title: { ru: 'Неделя подряд' }, description: { ru: '7 дней подряд с записью' } },
 *   ],
 * });
 * ```
 *
 * An unlocked achievement never disappears, even if the metric value later drops
 * (for example, repository stars), so a metric may also be a current value.
 */
export interface AchievementMetric {
  /** Unique id prefixed with the module id. */
  id: string;
  /** Web module id — achievements are grouped by it on the page. */
  module: string;
  measure: (userId: string) => Promise<number>;
  tiers: AchievementTier[];
}

/**
 * Short tier notation: `achievementTier(7, '🔥', { en: 'Week in a row', ru: 'Неделя подряд' }, {...})`
 */
export function achievementTier(
  goal: number,
  icon: string,
  title: LocalizedText,
  description: LocalizedText,
): AchievementTier {
  return { goal, icon, title, description };
}
