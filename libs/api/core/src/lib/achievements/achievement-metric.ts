import { AchievementRarity } from '@pd/contracts';
import { LocalizedText } from '../i18n/locale';

export type { LocalizedText };

export interface AchievementTier {
  /** Metric threshold at which the achievement unlocks. */
  goal: number;
  icon: string;
  title: LocalizedText;
  description: LocalizedText;
  /** By default it follows the tier's position in the metric (see `tierRarity`). */
  rarity?: AchievementRarity;
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
 * (for example, repository stars), so a metric may also be a current value. The exception is
 * the user counting the achievements again after the rules changed (`AchievementsService.recount`).
 */
export interface AchievementMetric {
  /** Unique id prefixed with the module id. */
  id: string;
  /** Web module id — achievements are grouped by it on the page. */
  module: string;
  measure: (userId: string) => Promise<number>;
  tiers: AchievementTier[];
  /**
   * The metric counts other achievements (meta achievements): it is measured after the others
   * are saved, so an achievement that is, say, the 25th unlocks in the same check.
   */
  countsAchievements?: boolean;
}

/**
 * Short tier notation: `achievementTier(7, '🔥', { en: 'Week in a row', ru: 'Неделя подряд' }, {...})`
 */
export function achievementTier(
  goal: number,
  icon: string,
  title: LocalizedText,
  description: LocalizedText,
  rarity?: AchievementRarity,
): AchievementTier {
  return { goal, icon, title, description, rarity };
}

export type AchievementTierTuple = [
  goal: number,
  icon: string,
  title: LocalizedText,
  description: LocalizedText,
  rarity?: AchievementRarity,
];

/** Many tiers in one line each: `achievementTiers([10, '🎮', {...}, {...}], [100, ...])`. */
export function achievementTiers(...tiers: AchievementTierTuple[]): AchievementTier[] {
  return tiers.map((tier) => achievementTier(...tier));
}

/**
 * Rarity by position, counted from the hardest tier: the last one is legendary
 * (only when a metric has 4+ tiers), then epic, then rare; the rest are common.
 * A single-tier metric is rare.
 */
export function tierRarity(metric: AchievementMetric, index: number): AchievementRarity {
  const explicit = metric.tiers[index]?.rarity;
  if (explicit) {
    return explicit;
  }
  const fromTop = metric.tiers.length - 1 - index;
  const ladder: AchievementRarity[] =
    metric.tiers.length >= 4 ? ['legendary', 'epic', 'rare'] : ['epic', 'rare'];
  if (metric.tiers.length === 1) {
    return 'rare';
  }
  return ladder[fromTop] ?? 'common';
}
