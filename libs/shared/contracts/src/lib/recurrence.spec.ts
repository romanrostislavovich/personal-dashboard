import { addRepeat, nextRepeat } from './recurrence';

describe('addRepeat', () => {
  it('steps by days and weeks', () => {
    expect(addRepeat('2026-10-30', { every: 3, unit: 'day' })).toBe('2026-11-02');
    expect(addRepeat('2026-10-30', { every: 2, unit: 'week' })).toBe('2026-11-13');
  });

  it('steps by months and years, over the end of a year', () => {
    expect(addRepeat('2026-11-15', { every: 3, unit: 'month' })).toBe('2027-02-15');
    expect(addRepeat('2026-10-02', { every: 1, unit: 'year' })).toBe('2027-10-02');
  });

  it('puts the 31st on the last day of a shorter month', () => {
    expect(addRepeat('2026-01-31', { every: 1, unit: 'month' })).toBe('2026-02-28');
    expect(addRepeat('2024-02-29', { every: 1, unit: 'year' })).toBe('2025-02-28');
  });
});

describe('nextRepeat', () => {
  it('is one step ahead when the thing was done in time', () => {
    expect(nextRepeat('2026-10-05', { every: 1, unit: 'week' }, '2026-10-05')).toBe('2026-10-12');
  });

  it('skips the steps already in the past', () => {
    // A weekly task of 5 October finished on the 20th comes back on the 26th, not on the 12th.
    expect(nextRepeat('2026-10-05', { every: 1, unit: 'week' }, '2026-10-20')).toBe('2026-10-26');
    expect(nextRepeat('2026-10-01', { every: 1, unit: 'day' }, '2026-10-20')).toBe('2026-10-21');
  });
});
