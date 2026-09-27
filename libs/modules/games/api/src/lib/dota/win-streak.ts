/** Самая длинная серия побед подряд; результаты матчей — в хронологическом порядке. */
export function longestWinStreak(results: boolean[]): number {
  let longest = 0;
  let current = 0;
  for (const won of results) {
    current = won ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}
