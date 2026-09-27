import { AchievementMetric, achievementTier, tierRarity } from './achievement-metric';

function metricWithTiers(count: number): AchievementMetric {
  return {
    id: 'test.metric',
    module: 'test',
    measure: async () => 0,
    tiers: Array.from({ length: count }, (_, i) => achievementTier(i + 1, '⭐', {}, {})),
  };
}

const rarities = (count: number) =>
  Array.from({ length: count }, (_, i) => tierRarity(metricWithTiers(count), i));

describe('tierRarity', () => {
  it('counts from the hardest tier', () => {
    expect(rarities(1)).toEqual(['rare']);
    expect(rarities(2)).toEqual(['rare', 'epic']);
    expect(rarities(3)).toEqual(['common', 'rare', 'epic']);
    expect(rarities(5)).toEqual(['common', 'common', 'rare', 'epic', 'legendary']);
  });

  it('respects an explicit rarity', () => {
    const metric = metricWithTiers(2);
    metric.tiers[0].rarity = 'legendary';
    expect(tierRarity(metric, 0)).toBe('legendary');
  });
});
