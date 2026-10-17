import {
  addDays,
  Correlation,
  CorrelationMetric,
  CorrelationRegression,
  Correlations,
  DailyMetric,
  LocalDate,
  parseLocalDate,
  toLocalDate,
} from '@pd/contracts';
import { MOOD_METRIC } from '../mood-insights';
import {
  benjaminiHochberg,
  correlationP,
  effectiveDays,
  leastSquares,
  mean,
  partial,
  pearson,
  ranks,
  slope,
  spearman,
  tTwoSidedP,
} from './statistics';

/** Fewer days together than this, and a correlation is a coincidence. */
export const MIN_DAYS = 14;
/** A pair is shown as a link when its corrected p-value is under this… */
const MAX_Q = 0.1;
/** …and the correlation is at least this strong. */
const MIN_RHO = 0.25;
/** The regression takes at most this many predictors, and a predictor needs this many days. */
const MAX_TERMS = 6;
const DAYS_PER_TERM = 10;
/** A predictor is tried in the regression only when its own correlation is under this p. */
const TERM_MAX_P = 0.2;

/** A day a number does not mean anything on is left out; a quantity's empty day is a zero. */
const READINGS: DailyMetric['unit'][] = ['degrees', 'clock', 'score', 'percent'];

/** Weekends shape most of the numbers at once: a number of their own, to see it and allow for it. */
export const WEEKEND_METRIC = 'life.weekend';

type Series = Map<LocalDate, number>;

interface Prepared {
  metric: DailyMetric;
  series: Series;
  /** The correlation of a day with the day before: how slowly the number changes. */
  auto: number;
}

/**
 * The links engine: every daily number of every section against every other, of the same day
 * and of the next one, with what predicts a chosen number when the others are held fixed.
 *
 * It finds what goes together and what comes before what; that is not proof that one causes
 * the other — the page says so. Two things keep chance out: the p-values allow for the days'
 * own trends (see effectiveDays), and they are corrected for the number of pairs compared.
 */
export function correlations(
  metrics: DailyMetric[],
  period: { from: LocalDate; to: LocalDate },
  target?: string,
): Correlations {
  const days = daysOf(period);
  const prepared = [...metrics, weekend(days)]
    .map((metric) => prepare(metric, days))
    .filter((item) => item.series.size >= MIN_DAYS);

  const found = pairs(prepared);
  const q = benjaminiHochberg(found.map((pair) => pair.p));
  const all: Correlation[] = found.map((pair, index) => ({
    ...pair,
    q: round(q[index], 4),
    strong: q[index] < MAX_Q && Math.abs(pair.rho) >= MIN_RHO,
  }));
  all.sort((a, b) => Number(b.strong) - Number(a.strong) || Math.abs(b.rho) - Math.abs(a.rho));

  const wanted =
    target ?? (prepared.some((item) => item.metric.key === MOOD_METRIC) ? MOOD_METRIC : undefined);
  return {
    ...period,
    metrics: prepared.map(({ metric, series }) => describe(metric, series)),
    correlations: all,
    regression: wanted ? regression(prepared, all, wanted) : null,
  };
}

function prepare(metric: DailyMetric, days: LocalDate[]): Prepared {
  const given = new Map(metric.days.map((day) => [day.day, day.value]));
  const series: Series = new Map();
  if (READINGS.includes(metric.unit)) {
    for (const day of days) {
      if (given.has(day)) {
        series.set(day, given.get(day) as number);
      }
    }
  } else {
    // A quantity counts from its first day to its last: before it the section was not used.
    const known = days.filter((day) => given.has(day));
    const [first, last] = [known[0], known[known.length - 1]];
    for (const day of days) {
      if (first && day >= first && day <= last) {
        series.set(day, given.get(day) ?? 0);
      }
    }
  }
  return { metric, series, auto: autocorrelation(series, days) };
}

function autocorrelation(series: Series, days: LocalDate[]): number {
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 1; i < days.length; i++) {
    const [before, after] = [series.get(days[i - 1]), series.get(days[i])];
    if (before !== undefined && after !== undefined) {
      x.push(before);
      y.push(after);
    }
  }
  return x.length >= 3 ? pearson(x, y) : 0;
}

type Pair = Omit<Correlation, 'q' | 'strong'>;

function pairs(prepared: Prepared[]): Pair[] {
  const result: Pair[] = [];
  const sorted = [...prepared].sort((a, b) => a.metric.key.localeCompare(b.metric.key));
  for (const a of sorted) {
    for (const b of sorted) {
      if (a === b || related(a.metric, b.metric)) {
        continue;
      }
      // Of the same day, a pair once; of the next day, both ways round.
      const lags: (0 | 1)[] = a.metric.key < b.metric.key ? [0, 1] : [1];
      // Whether tomorrow is a Saturday is known without any number.
      const calendar = [a, b].some((item) => item.metric.key === WEEKEND_METRIC);
      for (const lag of calendar ? lags.filter((one) => one === 0) : lags) {
        const pair = compare(a, b, lag);
        if (pair) {
          result.push(pair);
        }
      }
    }
  }
  return result;
}

/** A number and a part of it go together by themselves. */
function related(a: DailyMetric, b: DailyMetric): boolean {
  return a.partOf === b.key || b.partOf === a.key;
}

function compare(a: Prepared, b: Prepared, lag: 0 | 1): Pair | null {
  const x: number[] = [];
  const y: number[] = [];
  // For a lag: b of the same day as a, held fixed in beyondItself.
  const z: number[] = [];
  for (const [day, value] of a.series) {
    const next = lag ? shift(day, 1) : day;
    const later = b.series.get(next);
    if (later === undefined) {
      continue;
    }
    x.push(value);
    y.push(later);
    z.push(b.series.get(day) ?? NaN);
  }
  if (x.length < MIN_DAYS) {
    return null;
  }
  const rho = spearman(x, y);
  const n = x.length;
  const p = correlationP(rho, effectiveDays(n, a.auto, b.auto));
  return {
    a: a.metric.key,
    b: b.metric.key,
    lag,
    rho: round(rho, 3),
    n,
    p: round(p, 6),
    beyondItself: lag ? beyond(x, y, z) : null,
    slope: round(slope(x, y), 4),
  };
}

/** The partial correlation of x and y with z held fixed, on the days z is known. */
function beyond(x: number[], y: number[], z: number[]): number | null {
  const keep = z.map((value, index) => (Number.isNaN(value) ? -1 : index)).filter((i) => i >= 0);
  if (keep.length < MIN_DAYS) {
    return null;
  }
  const [rx, ry, rz] = [x, y, z].map((values) => ranks(keep.map((i) => values[i])));
  return round(partial(pearson(rx, ry), pearson(rx, rz), pearson(ry, rz)), 3);
}

/**
 * What predicts the target with the others held fixed: the numbers most linked to it (of its
 * day, or of the day before), together in one least-squares fit on standardized values, so
 * their coefficients compare.
 */
function regression(
  prepared: Prepared[],
  found: Correlation[],
  target: string,
): CorrelationRegression | null {
  const goal = prepared.find((item) => item.metric.key === target);
  if (!goal) {
    return null;
  }
  type Candidate = { key: string; lag: 0 | 1; p: number };
  const candidates = found
    .flatMap((pair): Candidate[] => {
      if (pair.lag === 0 && (pair.a === target || pair.b === target)) {
        return [{ key: pair.a === target ? pair.b : pair.a, lag: 0, p: pair.p }];
      }
      return pair.lag === 1 && pair.b === target ? [{ key: pair.a, lag: 1, p: pair.p }] : [];
    })
    .filter((candidate) => candidate.p < TERM_MAX_P)
    .sort((a, b) => a.p - b.p);
  // One lag a number (of its day or of the day before, whichever says more), and never a
  // number together with a part of it: the two would share what they explain.
  const metricOf = (key: string) => prepared.find((item) => item.metric.key === key)?.metric;
  const chosen: Candidate[] = [];
  for (const candidate of candidates) {
    const metric = metricOf(candidate.key);
    const clash = chosen.some((other) => {
      const taken = metricOf(other.key);
      return other.key === candidate.key || (metric && taken && related(metric, taken));
    });
    if (!clash) {
      chosen.push(candidate);
    }
  }
  let terms = chosen.slice(0, MAX_TERMS);
  while (terms.length) {
    const rows = rowsOf(prepared, goal, terms);
    if (rows.length >= DAYS_PER_TERM * (terms.length + 1)) {
      const fit = fitOn(rows, terms.length);
      if (fit) {
        const df = rows.length - terms.length - 1;
        return {
          target,
          n: rows.length,
          r2: round(Math.max(0, 1 - ((1 - fit.r2) * (rows.length - 1)) / df), 3),
          terms: terms
            .map((term, index) => ({
              key: term.key,
              lag: term.lag,
              beta: round(fit.coefficients[index], 3),
              p: round(tTwoSidedP(fit.coefficients[index] / fit.errors[index], df), 6),
            }))
            .sort((a, b) => Math.abs(b.beta) - Math.abs(a.beta)),
        };
      }
    }
    // Too few days with all of them (or two that say the same): the weakest goes.
    terms = terms.slice(0, -1);
  }
  return null;
}

/** The days the target and every term have a value on: [target, ...terms]. */
function rowsOf(
  prepared: Prepared[],
  goal: Prepared,
  terms: { key: string; lag: 0 | 1 }[],
): number[][] {
  const series = terms.map((term) => prepared.find((item) => item.metric.key === term.key));
  const rows: number[][] = [];
  for (const [day, value] of goal.series) {
    const row = [value];
    terms.forEach((term, index) => {
      row.push(series[index]?.series.get(term.lag ? shift(day, -1) : day) ?? NaN);
    });
    if (row.every((cell) => !Number.isNaN(cell))) {
      rows.push(row);
    }
  }
  return rows;
}

function fitOn(rows: number[][], k: number) {
  const columns = Array.from({ length: k + 1 }, (_, j) => standardize(rows.map((row) => row[j])));
  if (columns.some((column) => !column)) {
    return null; // A number that never changed on these days explains nothing.
  }
  const [y, ...x] = columns as number[][];
  return leastSquares(
    rows.map((_, r) => x.map((column) => column[r])),
    y,
  );
}

function standardize(values: number[]): number[] | null {
  const m = mean(values);
  const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / values.length);
  return sd ? values.map((value) => (value - m) / sd) : null;
}

function describe(metric: DailyMetric, series: Series): CorrelationMetric {
  const { key, module, labelKey, label, unit, currency } = metric;
  return {
    key,
    module,
    labelKey,
    ...(label ? { label } : {}),
    unit,
    ...(currency ? { currency } : {}),
    days: series.size,
    values: [...series].map(([day, value]) => ({ day, value: round(value, 3) })),
  };
}

function weekend(days: LocalDate[]): DailyMetric {
  return {
    key: WEEKEND_METRIC,
    module: 'life',
    labelKey: 'life.links.weekend',
    unit: 'count',
    days: days.map((day) => {
      const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
      return { day, value: weekday === 0 || weekday === 6 ? 1 : 0 };
    }),
  };
}

function daysOf({ from, to }: { from: LocalDate; to: LocalDate }): LocalDate[] {
  const days: LocalDate[] = [];
  for (let day = from; day <= to && days.length < 3700; day = shift(day, 1)) {
    days.push(day);
  }
  return days;
}

const shifted = new Map<string, LocalDate>();

/** The day `by` days later; remembered, as every pair asks for the same days. */
function shift(day: LocalDate, by: number): LocalDate {
  const key = `${day}${by}`;
  let result = shifted.get(key);
  if (!result) {
    result = toLocalDate(addDays(parseLocalDate(day), by));
    if (shifted.size > 20_000) {
      shifted.clear();
    }
    shifted.set(key, result);
  }
  return result;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
