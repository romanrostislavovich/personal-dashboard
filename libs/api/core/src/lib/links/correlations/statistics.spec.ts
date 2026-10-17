import {
  benjaminiHochberg,
  correlationP,
  effectiveDays,
  leastSquares,
  partial,
  ranks,
  spearman,
  tTwoSidedP,
} from './statistics';

describe('statistics', () => {
  it('ranks equal values with the average of their ranks', () => {
    expect(ranks([10, 20, 20, 5])).toEqual([2, 3.5, 3.5, 1]);
  });

  it('sees a monotone link whatever its shape', () => {
    const x = [1, 2, 3, 4, 5, 6];
    expect(
      spearman(
        x,
        x.map((v) => v ** 3),
      ),
    ).toBeCloseTo(1);
    expect(
      spearman(
        x,
        x.map((v) => -Math.exp(v)),
      ),
    ).toBeCloseTo(-1);
  });

  it("gives Student's t the p-values of its tables", () => {
    // t = 2.228 is the two-sided 5% point at 10 degrees of freedom; 1.96 at infinity.
    expect(tTwoSidedP(2.228, 10)).toBeCloseTo(0.05, 3);
    expect(tTwoSidedP(1.96, 10_000)).toBeCloseTo(0.05, 3);
    expect(tTwoSidedP(0, 5)).toBeCloseTo(1);
  });

  it('calls a weak correlation over few days a chance, and a strong one over many not', () => {
    expect(correlationP(0.3, 15)).toBeGreaterThan(0.2);
    expect(correlationP(0.5, 100)).toBeLessThan(0.0001);
  });

  it('counts slow series as fewer independent days', () => {
    expect(effectiveDays(100, 0, 0.9)).toBe(100);
    expect(effectiveDays(100, 0.9, 0.9)).toBeCloseTo(10.5, 1);
  });

  it('corrects p-values for the number of comparisons, keeping their order', () => {
    const q = benjaminiHochberg([0.01, 0.04, 0.03, 0.5]);
    expect(q[0]).toBeCloseTo(0.04);
    expect(q[2]).toBeCloseTo(0.0533, 3);
    expect(q[1]).toBeCloseTo(0.0533, 3);
    expect(q[3]).toBeCloseTo(0.5);
  });

  it('holds a common cause fixed', () => {
    expect(partial(0.5, 0.7, 0.7)).toBeCloseTo(0.0196, 3);
  });

  it('finds the coefficients of an exact linear relation', () => {
    const x = [
      [1, 0],
      [2, 1],
      [3, 0],
      [4, 1],
      [5, 3],
    ];
    const fit = leastSquares(
      x,
      x.map(([a, b]) => 2 * a - 3 * b + 1),
    );
    expect(fit?.coefficients[0]).toBeCloseTo(2);
    expect(fit?.coefficients[1]).toBeCloseTo(-3);
    expect(fit?.r2).toBeCloseTo(1);
  });

  it('refuses columns that say the same', () => {
    expect(
      leastSquares(
        [
          [1, 2],
          [2, 4],
          [3, 6],
          [4, 8],
        ],
        [1, 2, 3, 5],
      ),
    ).toBeNull();
  });
});
