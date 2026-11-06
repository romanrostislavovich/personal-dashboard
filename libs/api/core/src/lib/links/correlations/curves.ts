import {mean, leastSquares, ranks, tTwoSidedP} from './statistics';

/**
 * A bend is shown only when its standardized coefficient is at least this: smaller ones, even
 * when not by chance, change nothing one would act on.
 */
export const MIN_BEND = 0.25;

/** How strongly and how surely a pair bends, see bendOf. */
export interface Bend {
  /** The standardized coefficient of the square: + a valley, − a hill ("up, then down"). */
  beta: number;
  p: number;
}

/**
 * Whether `y` follows `x` along a curve rather than a straight line: the ranks of `y` fitted on
 * the ranks of `x` and their square, the square's coefficient tested. A rank correlation sees
 * "more, then the same" only by half and "more, then less" not at all; this sees both. The
 * p-value takes `days` — the days' own trends allowed for, as in the straight links.
 */
export function bendOf(x: number[], y: number[], days: number): Bend | null {
  const rx = standardized(ranks(x));
  const ry = standardized(ranks(y));
  if (!rx || !ry) {
    return null;
  }
  const square = standardized(rx.map(value => value * value));
  if (!square) {
    return null;
  }
  const fit = leastSquares(
    rx.map((value, index) => [value, square[index]]),
    ry,
  );
  const df = Math.floor(days) - 3;
  if (!fit || df <= 0 || !fit.errors[1]) {
    return null;
  }
  const beta = fit.coefficients[1];
  return {beta, p: tTwoSidedP(beta / fit.errors[1], df)};
}

function standardized(values: number[]): number[] | null {
  const m = mean(values);
  const sd = Math.sqrt(
    values.reduce((sum, value) => sum + (value - m) ** 2, 0) / values.length,
  );
  return sd > 1e-9 ? values.map(value => (value - m) / sd) : null;
}
