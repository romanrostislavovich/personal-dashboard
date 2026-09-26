import { dueChargeDate } from './due-charge-date';

describe('dueChargeDate', () => {
  const payment = { dayOfMonth: 10, isActive: true, lastChargedOn: null };

  it('is not due before the charge day', () => {
    expect(dueChargeDate(payment, { year: 2026, month: 9, day: 9 })).toBeNull();
  });

  it('is due on the charge day', () => {
    expect(dueChargeDate(payment, { year: 2026, month: 9, day: 10 })).toBe('2026-09-10');
  });

  it('catches up after missed days, keeping the original charge date', () => {
    expect(dueChargeDate(payment, { year: 2026, month: 9, day: 14 })).toBe('2026-09-10');
  });

  it('is not charged twice in the same month', () => {
    const charged = { ...payment, lastChargedOn: '2026-09-10' };
    expect(dueChargeDate(charged, { year: 2026, month: 9, day: 20 })).toBeNull();
  });

  it('is due again next month', () => {
    const charged = { ...payment, lastChargedOn: '2026-09-10' };
    expect(dueChargeDate(charged, { year: 2026, month: 10, day: 10 })).toBe('2026-10-10');
  });

  it('uses the last day of a short month for day 31', () => {
    const endOfMonth = { ...payment, dayOfMonth: 31 };
    expect(dueChargeDate(endOfMonth, { year: 2026, month: 2, day: 28 })).toBe('2026-02-28');
  });

  it('skips inactive payments', () => {
    expect(
      dueChargeDate({ ...payment, isActive: false }, { year: 2026, month: 9, day: 10 }),
    ).toBeNull();
  });
});
