import { nextBirthday } from './next-birthday';

describe('nextBirthday', () => {
  const today = { year: 2026, month: 9, day: 26 };

  it('returns 0 days when the birthday is today', () => {
    expect(nextBirthday({ month: 9, day: 26, year: 1990 }, today)).toEqual({
      nextDate: '2026-09-26',
      daysUntil: 0,
      turningAge: 36,
    });
  });

  it('counts days to a birthday later this year', () => {
    expect(nextBirthday({ month: 10, day: 3, year: null }, today)).toEqual({
      nextDate: '2026-10-03',
      daysUntil: 7,
      turningAge: null,
    });
  });

  it('moves to next year when the birthday has passed', () => {
    const result = nextBirthday({ month: 1, day: 15, year: 2000 }, today);
    expect(result.nextDate).toBe('2027-01-15');
    expect(result.turningAge).toBe(27);
  });

  it('celebrates Feb 29 on Feb 28 in a non-leap year', () => {
    expect(nextBirthday({ month: 2, day: 29, year: null }, today).nextDate).toBe('2027-02-28');
  });

  it('keeps Feb 29 in a leap year', () => {
    const leapToday = { year: 2028, month: 1, day: 1 };
    expect(nextBirthday({ month: 2, day: 29, year: null }, leapToday).nextDate).toBe('2028-02-29');
  });
});
