import { describe, expect, it } from 'vitest';
import {
  addMonths,
  contractDates,
  DatedPayment,
  datesToRemind,
  keyDates,
  nextCancelBy,
  nextYearlyCharge,
} from './contract-dates';

const terms = {
  contractStartedOn: '2025-03-15',
  contractMonths: 12,
  noticeDays: 30,
  autoRenews: true,
};

describe('addMonths', () => {
  it('keeps the day, or takes the last day of a shorter month', () => {
    expect(addMonths('2025-03-15', 12)).toBe('2026-03-15');
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonths('2024-11-30', 3)).toBe('2025-02-28');
  });
});

describe('contractDates', () => {
  it('counts the term running today and the last day to give notice', () => {
    expect(contractDates(terms, null, '2026-10-19')).toEqual({
      startedOn: '2025-03-15',
      startGuessed: false,
      termEndsOn: '2027-03-15',
      cancelBy: '2027-02-13',
      tooLate: false,
    });
  });

  it('takes the first charge seen when the start is not given', () => {
    const dates = contractDates({ ...terms, contractStartedOn: null }, '2026-01-05', '2026-10-19');
    expect(dates).toMatchObject({ startedOn: '2026-01-05', startGuessed: true });
    expect(dates?.termEndsOn).toBe('2027-01-05');
  });

  it('says when notice is too late for this term, and gives the next chance', () => {
    const dates = contractDates(terms, null, '2027-03-01');
    expect(dates).toMatchObject({ termEndsOn: '2027-03-15', tooLate: true });
    expect(nextCancelBy(terms, dates!)).toBe('2028-02-14');
  });

  it('keeps the one end of a term that does not renew', () => {
    const once = { ...terms, autoRenews: false };
    expect(contractDates(once, null, '2027-06-01')?.termEndsOn).toBe('2026-03-15');
    expect(nextCancelBy(once, contractDates(once, null, '2027-06-01')!)).toBeNull();
  });

  it('gives nothing without a term or a start', () => {
    expect(contractDates({ ...terms, contractMonths: null }, null, '2026-10-19')).toBeNull();
    expect(contractDates({ ...terms, contractStartedOn: null }, null, '2026-10-19')).toBeNull();
  });
});

describe('nextYearlyCharge', () => {
  it('is this year’s charge while ahead, else next year’s', () => {
    expect(nextYearlyCharge({ dayOfMonth: 31, monthOfYear: 11 }, '2026-10-19')).toBe('2026-11-30');
    expect(nextYearlyCharge({ dayOfMonth: 1, monthOfYear: 3 }, '2026-10-19')).toBe('2027-03-01');
  });
});

const payment = (fields: Partial<DatedPayment>): DatedPayment => ({
  id: 'p',
  name: 'Internet',
  amount: 60,
  currency: 'PLN',
  isActive: true,
  period: 'month',
  dayOfMonth: 10,
  monthOfYear: null,
  trialEndsOn: null,
  priceLockedUntil: null,
  contractStartedOn: null,
  contractMonths: null,
  noticeDays: null,
  autoRenews: true,
  contract: null,
  ...fields,
});

describe('keyDates', () => {
  it('lists the dates ahead, the nearest first, the inactive left out', () => {
    const today = '2026-10-19';
    const dates = keyDates(
      [
        payment({ ...terms, contract: contractDates(terms, null, today) }),
        payment({ id: 'y', name: 'Domain', period: 'year', monthOfYear: 11, dayOfMonth: 2 }),
        payment({
          id: 'l',
          name: 'Phone',
          priceLockedUntil: '2026-12-31',
          trialEndsOn: '2026-01-01',
        }),
        payment({ id: 'off', isActive: false, priceLockedUntil: '2026-11-01' }),
      ],
      today,
    );
    expect(dates.map((d) => `${d.kind} ${d.date}`)).toEqual([
      'renewal 2026-11-02',
      'price-lock 2026-12-31',
      'cancel-by 2027-02-13',
    ]);
  });
});

describe('datesToRemind', () => {
  it('reminds of a near date once', () => {
    const dates = keyDates(
      [payment({ id: 'y', period: 'year', monthOfYear: 10, dayOfMonth: 25 })],
      '2026-10-19',
    );
    expect(datesToRemind(dates, new Map(), '2026-10-19')).toHaveLength(1);
    expect(datesToRemind(dates, new Map([['y', ['renewal:2026-10-25']]]), '2026-10-19')).toEqual(
      [],
    );
    expect(datesToRemind(dates, new Map(), '2026-10-10')).toEqual([]);
  });
});
