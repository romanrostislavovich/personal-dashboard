import {WorthItem} from '@pd/contracts';
import {describe, expect, it} from 'vitest';
import {burnPeriod, burnRate, monthAgo, runway, totals} from './net-worth';

const item = (fields: Partial<WorthItem>): WorthItem => ({
  source: 'manual',
  id: 'a',
  name: 'Cash',
  kind: 'cash',
  amount: 100,
  currency: 'PLN',
  inMain: 100,
  liquid: true,
  at: null,
  ...fields,
});

describe('totals', () => {
  it('takes the debts off the worth but not off the money at hand', () => {
    expect(
      totals([
        item({inMain: 5000}),
        item({kind: 'property', inMain: 300_000, liquid: false}),
        item({kind: 'debt', inMain: -200_000, liquid: false}),
        item({inMain: null}),
      ]),
    ).toEqual({total: 105_000, liquid: 5000});
  });
});

describe('burnPeriod', () => {
  it('is the three full months before this one', () => {
    expect(burnPeriod('2026-10-19')).toEqual({
      from: '2026-07-01',
      to: '2026-09-30',
    });
    expect(burnPeriod('2026-01-05')).toEqual({
      from: '2025-10-01',
      to: '2025-12-31',
    });
  });
});

describe('burnRate', () => {
  it('averages over the months that have expenses', () => {
    const byDay = new Map([
      ['2026-08-03', 1000],
      ['2026-08-20', 500],
      ['2026-09-10', 2500],
    ]);
    expect(burnRate(byDay)).toEqual({perMonth: 2000, months: 2});
    expect(burnRate(new Map())).toEqual({perMonth: 0, months: 0});
  });
});

describe('runway', () => {
  it('is the months the money at hand lasts', () => {
    expect(runway(10_000, 3000)).toBe(3.3);
    expect(runway(-50, 3000)).toBe(0);
    expect(runway(10_000, 0)).toBeNull();
  });
});

describe('monthAgo', () => {
  it('takes the newest point at least 30 days old', () => {
    const history = [
      {day: '2026-08-01', total: 1},
      {day: '2026-09-18', total: 2},
      {day: '2026-10-01', total: 3},
    ];
    expect(monthAgo(history, '2026-10-19')).toBe(2);
    expect(monthAgo(history.slice(2), '2026-10-19')).toBeNull();
  });
});
