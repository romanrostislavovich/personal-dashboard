import { fillPlaysByDay } from './plays-by-day';

describe('fillPlaysByDay', () => {
  const today = { year: 2026, month: 10, day: 2 };

  it('returns one point per day ending today, zeros for silent days', () => {
    expect(fillPlaysByDay([{ day: '2026-09-30', plays: 12 }], today, 4)).toEqual([
      { day: '2026-09-29', plays: 0 },
      { day: '2026-09-30', plays: 12 },
      { day: '2026-10-01', plays: 0 },
      { day: '2026-10-02', plays: 0 },
    ]);
  });

  it('ignores days outside the window', () => {
    const result = fillPlaysByDay([{ day: '2026-01-01', plays: 5 }], today, 2);
    expect(result.every((point) => point.plays === 0)).toBe(true);
  });
});
