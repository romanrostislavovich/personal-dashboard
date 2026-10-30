/*
 * The few statistics the links engine needs, without a library: ranks, correlations, the
 * p-value of Student's t, the Benjamini–Hochberg correction and least squares.
 */

export function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Ranks from 1; equal values share the average of their ranks. */
export function ranks(values: number[]): number[] {
  const order = values
    .map((value, index) => ({value, index}))
    .sort((a, b) => a.value - b.value);
  const result = new Array<number>(values.length);
  for (let start = 0; start < order.length;) {
    let end = start;
    while (
      end + 1 < order.length &&
      order[end + 1].value === order[start].value
    ) {
      end++;
    }
    const rank = (start + end) / 2 + 1;
    for (let i = start; i <= end; i++) {
      result[order[i].index] = rank;
    }
    start = end + 1;
  }
  return result;
}

/** Pearson's correlation; 0 when either side never changes. */
export function pearson(x: number[], y: number[]): number {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** Spearman's correlation: Pearson's of the ranks, so an outlier day does not decide it. */
export function spearman(x: number[], y: number[]): number {
  return pearson(ranks(x), ranks(y));
}

/** The correlation of x and y with z held fixed. */
export function partial(rxy: number, rxz: number, ryz: number): number {
  const denominator = Math.sqrt((1 - rxz ** 2) * (1 - ryz ** 2));
  return denominator > 1e-9 ? (rxy - rxz * ryz) / denominator : 0;
}

/** How much y changes for one unit of x (least squares); 0 when x never changes. */
export function slope(x: number[], y: number[]): number {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
  }
  return sxx ? sxy / sxx : 0;
}

/**
 * Days that follow each other are not independent (a slow week is slow day after day), and
 * counting them as such makes chance look like a link. The number of independent days two
 * series are worth, from their correlations with the day before (Bartlett's approximation).
 */
export function effectiveDays(n: number, autoX: number, autoY: number): number {
  const product = Math.max(0, autoX * autoY);
  return Math.min(n, Math.max(3, (n * (1 - product)) / (1 + product)));
}

/** The two-sided p-value of a correlation over `n` independent days. */
export function correlationP(r: number, n: number): number {
  const df = n - 2;
  if (df <= 0) {
    return 1;
  }
  if (Math.abs(r) >= 1) {
    return 0;
  }
  return tTwoSidedP(r * Math.sqrt(df / (1 - r * r)), df);
}

/** P(|T| ≥ |t|) for Student's t with `df` degrees of freedom. */
export function tTwoSidedP(t: number, df: number): number {
  if (!Number.isFinite(t)) {
    return 0;
  }
  return Math.min(1, incompleteBeta(df / (df + t * t), df / 2, 0.5));
}

/** Benjamini–Hochberg: each p-value as the false discovery rate it would take to accept it. */
export function benjaminiHochberg(ps: number[]): number[] {
  const order = ps.map((p, index) => ({p, index})).sort((a, b) => b.p - a.p);
  const q = new Array<number>(ps.length);
  let smallest = 1;
  order.forEach(({p, index}, position) => {
    const rank = ps.length - position;
    smallest = Math.min(smallest, (p * ps.length) / rank);
    q[index] = smallest;
  });
  return q;
}

export interface LeastSquares {
  /** One per column of x. */
  coefficients: number[];
  /** Their standard errors. */
  errors: number[];
  /** The share of y's variance explained, 0–1. */
  r2: number;
}

/**
 * Least squares of y on the columns of x with an intercept. `null` — fewer rows than it needs,
 * or columns that say the same.
 */
export function leastSquares(x: number[][], y: number[]): LeastSquares | null {
  const n = y.length;
  const k = x[0]?.length ?? 0;
  if (n <= k + 1) {
    return null;
  }
  const rows = x.map(row => [1, ...row]);
  const size = k + 1;
  const xtx = Array.from({length: size}, (_, i) =>
    Array.from({length: size}, (_, j) =>
      rows.reduce((sum, row) => sum + row[i] * row[j], 0),
    ),
  );
  const inverse = invert(xtx);
  if (!inverse) {
    return null;
  }
  const xty = Array.from({length: size}, (_, i) =>
    rows.reduce((sum, row, r) => sum + row[i] * y[r], 0),
  );
  const beta = inverse.map(row =>
    row.reduce((sum, value, j) => sum + value * xty[j], 0),
  );
  const my = mean(y);
  let rss = 0;
  let tss = 0;
  rows.forEach((row, r) => {
    const fitted = row.reduce((sum, value, j) => sum + value * beta[j], 0);
    rss += (y[r] - fitted) ** 2;
    tss += (y[r] - my) ** 2;
  });
  const variance = rss / (n - size);
  return {
    coefficients: beta.slice(1),
    errors: inverse
      .slice(1)
      .map((row, i) => Math.sqrt(Math.max(0, variance * row[i + 1]))),
    r2: tss ? 1 - rss / tss : 0,
  };
}

/** Gauss–Jordan with partial pivoting; `null` for a singular matrix. */
function invert(matrix: number[][]): number[][] | null {
  const size = matrix.length;
  const a = matrix.map((row, i) => [
    ...row,
    ...Array.from({length: size}, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) {
        pivot = row;
      }
    }
    if (Math.abs(a[pivot][column]) < 1e-10) {
      return null;
    }
    [a[column], a[pivot]] = [a[pivot], a[column]];
    const divisor = a[column][column];
    a[column] = a[column].map(value => value / divisor);
    for (let row = 0; row < size; row++) {
      if (row !== column) {
        const factor = a[row][column];
        a[row] = a[row].map((value, j) => value - factor * a[column][j]);
      }
    }
  }
  return a.map(row => row.slice(size));
}

/** The regularized incomplete beta function I_x(a, b) (Numerical Recipes, betai). */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) {
    return 0;
  }
  if (x >= 1) {
    return 1;
  }
  const front = Math.exp(
    logGamma(a + b) -
      logGamma(a) -
      logGamma(b) +
      a * Math.log(x) +
      b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (front * continuedFraction(x, a, b)) / a
    : 1 - (front * continuedFraction(1 - x, b, a)) / b;
}

function continuedFraction(x: number, a: number, b: number): number {
  const tiny = 1e-30;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  d = 1 / (Math.abs(d) < tiny ? tiny : d);
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    for (const term of [
      (m * (b - m) * x) / ((a + m2 - 1) * (a + m2)),
      (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1)),
    ]) {
      d = 1 + term * d;
      d = 1 / (Math.abs(d) < tiny ? tiny : d);
      c = 1 + term / c;
      c = Math.abs(c) < tiny ? tiny : c;
      h *= d * c;
    }
    if (Math.abs(d * c - 1) < 1e-12) {
      break;
    }
  }
  return h;
}

/** ln Γ(x), Lanczos' approximation. */
function logGamma(x: number): number {
  const g = [
    76.1800917294715, -86.5053203294168, 24.0140982408309, -1.23173957245015,
    0.120865097386618e-2, -0.5395239384953e-5,
  ];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let series = 1.00000000019002;
  for (const coefficient of g) {
    series += coefficient / ++y;
  }
  return -tmp + Math.log((2.506628274631 * series) / x);
}
