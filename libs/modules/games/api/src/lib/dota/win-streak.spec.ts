import { longestWinStreak } from './win-streak';

describe('longestWinStreak', () => {
  it('finds the longest run of wins', () => {
    expect(longestWinStreak([true, true, false, true, true, true, false])).toBe(3);
  });

  it('handles all losses and empty history', () => {
    expect(longestWinStreak([false, false])).toBe(0);
    expect(longestWinStreak([])).toBe(0);
  });
});
