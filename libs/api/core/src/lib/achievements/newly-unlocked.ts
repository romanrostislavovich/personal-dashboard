import { AchievementMetric, AchievementTier } from './achievement-metric';

export function achievementId(metric: AchievementMetric, tier: AchievementTier): string {
  return `${metric.id}.${tier.goal}`;
}

/** Metric tiers unlocked right now: threshold reached, but no achievement yet. */
export function newlyUnlockedTiers(
  metric: AchievementMetric,
  value: number,
  alreadyUnlocked: ReadonlySet<string>,
): AchievementTier[] {
  return metric.tiers.filter(
    (tier) => value >= tier.goal && !alreadyUnlocked.has(achievementId(metric, tier)),
  );
}
