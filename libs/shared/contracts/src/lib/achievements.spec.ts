import { levelFromXp } from './achievements';

describe('levelFromXp', () => {
  it('starts at level 1', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, xpInLevel: 0, xpForNext: 100 });
  });

  it('needs 100 × level XP for each next level', () => {
    expect(levelFromXp(99)).toEqual({ level: 1, xpInLevel: 99, xpForNext: 100 });
    expect(levelFromXp(100)).toEqual({ level: 2, xpInLevel: 0, xpForNext: 200 });
    expect(levelFromXp(350)).toEqual({ level: 3, xpInLevel: 50, xpForNext: 300 });
  });
});
