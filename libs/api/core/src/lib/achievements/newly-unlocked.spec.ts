import { AchievementMetric } from './achievement-metric';
import { achievementId, newlyUnlockedTiers } from './newly-unlocked';

const tier = (goal: number) => ({ goal, icon: '🔥', title: { ru: '' }, description: { ru: '' } });
const metric: AchievementMetric = {
  id: 'diary.streak',
  module: 'diary',
  measure: async () => 0,
  tiers: [tier(3), tier(7), tier(30)],
};

describe('newlyUnlockedTiers', () => {
  it('unlocks every reached tier at once', () => {
    expect(newlyUnlockedTiers(metric, 10, new Set()).map((t) => t.goal)).toEqual([3, 7]);
  });

  it('skips tiers that are already unlocked', () => {
    const unlocked = new Set([achievementId(metric, tier(3))]);
    expect(newlyUnlockedTiers(metric, 10, unlocked).map((t) => t.goal)).toEqual([7]);
  });

  it('unlocks nothing below the first goal', () => {
    expect(newlyUnlockedTiers(metric, 2, new Set())).toEqual([]);
  });

  it('builds ids as metric.goal', () => {
    expect(achievementId(metric, tier(30))).toBe('diary.streak.30');
  });
});
