import {doseGroups} from './links-dose';

describe('doseGroups', () => {
  it('splits the days into five groups of the first number, with the second averaged', () => {
    const x = Array.from({length: 50}, (_, index) => index);
    // Rises up to the middle, then stays: "up, then flat".
    const y = x.map(value => Math.min(value, 25));
    const groups = doseGroups(x, y);
    expect(groups.map(group => group.n)).toEqual([10, 10, 10, 10, 10]);
    expect(groups[0]).toMatchObject({from: 0, to: 9, mean: 4.5});
    expect(groups[3].mean).toBe(25);
    expect(groups[4].mean).toBe(25);
  });

  it('keeps the days of one value together: a yes/no number gets two groups', () => {
    const x = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const y = x.map(value => (value ? 4 : 2));
    expect(doseGroups(x, y)).toEqual([
      {from: 0, to: 0, mean: 2, n: 6},
      {from: 1, to: 1, mean: 4, n: 9},
    ]);
  });

  it('says nothing of too few days or of a number that never changes', () => {
    expect(doseGroups([1, 2, 3, 4], [1, 2, 3, 4])).toEqual([]);
    expect(doseGroups(Array(20).fill(5), Array(20).fill(1))).toEqual([]);
  });
});
