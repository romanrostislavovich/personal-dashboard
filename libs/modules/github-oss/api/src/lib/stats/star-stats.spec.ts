import { crossedStarMilestone, starsDelta } from './star-stats';

describe('crossedStarMilestone', () => {
  it('returns null when no milestone is crossed', () => {
    expect(crossedStarMilestone(12, 20)).toBeNull();
  });

  it('detects reaching a milestone exactly', () => {
    expect(crossedStarMilestone(99, 100)).toBe(100);
  });

  it('returns the highest milestone when several are crossed at once', () => {
    expect(crossedStarMilestone(48, 103)).toBe(100);
  });

  it('ignores star loss', () => {
    expect(crossedStarMilestone(101, 99)).toBeNull();
  });
});

describe('starsDelta', () => {
  const today = { year: 2026, month: 9, day: 30 };
  const history = [
    { day: '2026-09-01', stars: 80 },
    { day: '2026-09-20', stars: 90 },
    { day: '2026-09-23', stars: 95 },
    { day: '2026-09-29', stars: 99 },
  ];

  it('uses the latest point at least N days old as the baseline', () => {
    // 7 days ago = September 23 → 95 stars
    expect(starsDelta(history, 100, today, 7)).toBe(5);
  });

  it('falls back to the earliest point when history is shorter than the period', () => {
    expect(starsDelta(history, 100, today, 60)).toBe(20);
  });

  it('returns 0 without history', () => {
    expect(starsDelta([], 100, today, 7)).toBe(0);
  });
});
