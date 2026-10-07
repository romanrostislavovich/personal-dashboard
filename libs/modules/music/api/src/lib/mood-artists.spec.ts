import { moodArtists } from './mood-artists';

const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;
// Good days: 1–4. Bad days: 5–8. Day 9 is in the middle.
const mood = [
  ...[1, 2, 3, 4].map((n) => ({ day: day(n), value: 5 })),
  ...[5, 6, 7, 8].map((n) => ({ day: day(n), value: 1 })),
  { day: day(9), value: 3 },
];
const plays = (artist: string, days: number[], count = 2) =>
  days.map((n) => ({ day: day(n), artist, plays: count }));

describe('moodArtists', () => {
  it('tells who goes with the good days and who with the bad ones', () => {
    const result = moodArtists(mood, [
      ...plays('Bonobo', [1, 2, 3, 4, 5]),
      ...plays('Radiohead', [5, 6, 7, 9]),
      // Played every day alike: goes with neither.
      ...plays('Muse', [1, 2, 3, 4, 5, 6, 7, 8]),
      // Too few days to say anything.
      ...plays('Tool', [1, 2]),
    ]);
    expect(result).toMatchObject({ goodDays: 4, badDays: 4 });
    expect(result.onGoodDays).toEqual([{ artist: 'Bonobo', days: 4, plays: 8, share: 100 }]);
    expect(result.onBadDays).toEqual([{ artist: 'Radiohead', days: 3, plays: 6, share: 75 }]);
  });

  it('copes with no mood', () => {
    expect(moodArtists([], plays('Muse', [1, 2, 3]))).toEqual({
      goodDays: 0,
      badDays: 0,
      onGoodDays: [],
      onBadDays: [],
    });
  });
});
