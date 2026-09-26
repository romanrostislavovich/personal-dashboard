import {
  addDays,
  daysBetween,
  daysInMonth,
  parseLocalDate,
  todayIn,
  toLocalDate,
} from './local-date';

describe('local-date', () => {
  it('formats and parses YYYY-MM-DD', () => {
    expect(toLocalDate({ year: 2026, month: 3, day: 7 })).toBe('2026-03-07');
    expect(parseLocalDate('2026-03-07')).toEqual({ year: 2026, month: 3, day: 7 });
  });

  it('knows month lengths including leap years', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('counts days across a year boundary', () => {
    expect(daysBetween({ year: 2026, month: 12, day: 30 }, { year: 2027, month: 1, day: 2 })).toBe(
      3,
    );
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays({ year: 2026, month: 12, day: 30 }, 3)).toEqual({
      year: 2027,
      month: 1,
      day: 2,
    });
    expect(addDays({ year: 2026, month: 3, day: 1 }, -1)).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
  });

  it('resolves "today" in the given time zone', () => {
    // 23:30 UTC 31 декабря — в Варшаве уже 1 января.
    const now = new Date('2026-12-31T23:30:00Z');
    expect(todayIn('UTC', now)).toEqual({ year: 2026, month: 12, day: 31 });
    expect(todayIn('Europe/Warsaw', now)).toEqual({ year: 2027, month: 1, day: 1 });
  });
});
