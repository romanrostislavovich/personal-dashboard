import {
  DailyMetric,
  ForecastDriver,
  ForecastMade,
  LinksForecast,
  LocalDate,
} from '@pd/contracts';
import {daysOf, seriesOf, Series, shift} from './daily-series';

/*
 * A number of a day from the day before — the user's own model, trained on their own days: a
 * ridge regression over every daily number of the sections (sleep, steps, hours at the
 * computer, spending, music, the weather…), the number itself yesterday, over the week and on
 * the same weekdays, and whether the day is a weekend. A few hundred days are enough, it
 * explains itself (what pushed this day's forecast up and down), and it is trusted only when it
 * beats the plain guess — the number yesterday, on the same weekdays or over the week, whichever
 * of them guessed best — on the latest days.
 */

/** The bedtime: the band's start of sleep, else the phone's last use of the evening. */
export const BEDTIME_TARGET = 'links.bedtime';
const BAND_BEDTIME = 'health.band.bedtime';
const PHONE_LAST_USE = 'activity.phone.lastUse';

/** Fewer days with the number and the number the day before — no model. */
export const MIN_DAYS = 40;
/** A number present on fewer of the days than this share is left out. */
const MIN_COVERAGE = 0.5;
/** The pull towards zero of the weights: a small history must not chase noise. */
const RIDGE = 5;
/** The last share of the days, kept aside to measure it. */
const TEST_SHARE = 0.2;
/** Better than the plain guess by this much, or it is not trusted. */
const MUST_BEAT = 0.95;
const DRIVERS = 4;
/** The same weekday: over this many weeks back. */
const WEEKDAY_WEEKS = 8;

interface Feature {
  key: string;
  labelKey: string;
  label: string | null;
  unit: DailyMetric['unit'];
  currency?: string;
  /** The value the day before the day forecast. */
  value: (day: LocalDate) => number | undefined;
}

/**
 * The bedtime as a number of its own: the band's where it was worn, the phone's last use on
 * the other days (both are hours of the evening, over 24 after midnight). `null` — neither.
 */
export function bedtimeMetric(metrics: DailyMetric[]): DailyMetric | null {
  const band = metrics.find(metric => metric.key === BAND_BEDTIME);
  const phone = metrics.find(metric => metric.key === PHONE_LAST_USE);
  if (!band && !phone) {
    return null;
  }
  const days = new Map(phone?.days.map(day => [day.day, day.value]));
  for (const day of band?.days ?? []) {
    days.set(day.day, day.value);
  }
  return {
    key: BEDTIME_TARGET,
    module: 'life',
    labelKey: 'life.forecasts.bedtime',
    unit: 'clock',
    outcome: true,
    days: [...days]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, value]) => ({day, value})),
  };
}

/** The numbers a target is made of: they are the target itself, not what drives it. */
function sourcesOf(target: DailyMetric): string[] {
  return target.key === BEDTIME_TARGET
    ? [BEDTIME_TARGET, BAND_BEDTIME, PHONE_LAST_USE]
    : [target.key];
}

/**
 * The forecast of `target` on `day` from the day before it, learnt from the days up to it.
 * `metrics` are the drivers to choose from (the target among them is left out).
 */
export function forecast(
  metrics: DailyMetric[],
  target: DailyMetric,
  day: LocalDate,
  made: ForecastMade,
): LinksForecast {
  const empty: LinksForecast = {
    key: target.key,
    module: target.module,
    labelKey: target.labelKey,
    ...(target.label ? {label: target.label} : {}),
    unit: target.unit,
    ...(target.currency ? {currency: target.currency} : {}),
    day,
    made,
    value: null,
    days: 0,
    error: null,
    baselineError: null,
    baseline: null,
    trusted: false,
    drivers: [],
  };
  const allDays = [target, ...metrics]
    .flatMap(metric => metric.days.map(one => one.day))
    .sort();
  if (!allDays.length || allDays[0] > day) {
    return empty;
  }
  const days = daysOf({from: allDays[0], to: day});
  const own = seriesOf(target, days);
  const self = selfGuesses(own);

  // The days to learn from: the number on the day and on the day before, the days that are
  // over only (in the evening today is not: its number may still grow).
  const lastOver = shift(day, made === 'evening' ? -2 : -1);
  const rows = days.filter(
    one => one <= lastOver && own.has(one) && own.has(shift(one, -1)),
  );
  if (rows.length < MIN_DAYS) {
    return {...empty, days: rows.length};
  }

  const features: Feature[] = [
    selfFeature(target, 'self.yesterday', self.yesterday),
    selfFeature(target, 'self.week', self.week),
    selfFeature(target, 'self.weekday', self.weekday),
    {
      key: 'self.weekend',
      labelKey: 'life.forecasts.self.weekend',
      label: null,
      unit: 'count',
      value: one => (isWeekend(one) ? 1 : 0),
    },
  ];
  const sources = sourcesOf(target);
  for (const metric of metrics) {
    if (
      sources.includes(metric.key) ||
      sources.includes(metric.partOf ?? '') ||
      metric.parts?.some(part => sources.includes(part))
    ) {
      continue;
    }
    const series = seriesOf(metric, days);
    const present = rows.filter(one => series.has(shift(one, -1))).length;
    if (present / rows.length >= MIN_COVERAGE) {
      features.push({
        key: metric.key,
        labelKey: metric.labelKey,
        label: metric.label ?? null,
        unit: metric.unit,
        ...(metric.currency ? {currency: metric.currency} : {}),
        value: one => series.get(shift(one, -1)),
      });
    }
  }

  const rowOf = (one: LocalDate) => features.map(feature => feature.value(one));
  const actual = (one: LocalDate) => own.get(one) as number;
  const split = Math.floor(rows.length * (1 - TEST_SHARE));
  const learn = rows.slice(0, split);
  const test = rows.slice(split);

  const trained = fit(learn.map(rowOf), learn.map(actual));
  const error = mean(
    test.map(one => Math.abs(trained.predict(rowOf(one)) - actual(one))),
  );
  // The plain guess: the best of the three on the same days.
  const fallback = mean(learn.map(actual));
  const guesses = (['yesterday', 'week', 'weekday'] as const).map(name => ({
    name,
    error: mean(
      test.map(one => Math.abs((self[name](one) ?? fallback) - actual(one))),
    ),
  }));
  const best = guesses.reduce((a, b) => (b.error < a.error ? b : a));

  // The model of all the days answers for the day, and tells what pushed it up and down.
  const model = fit(rows.map(rowOf), rows.map(actual));
  const row = rowOf(day);
  const contributions = model.contributions(row);
  const drivers: ForecastDriver[] = features
    .map((feature, i) => ({feature, value: row[i], effect: contributions[i]}))
    .filter(({effect}) => Math.abs(effect) > 0)
    .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))
    .slice(0, DRIVERS)
    .map(({feature, value, effect}) => ({
      key: feature.key,
      labelKey: feature.labelKey,
      label: feature.label,
      unit: feature.unit,
      ...(feature.currency ? {currency: feature.currency} : {}),
      value: value === undefined ? null : round(value, 2),
      effect: round(effect, 2),
    }));

  // Never beyond what the number has ever been: no 7 of 5, no −1 task.
  const values = rows.map(actual);
  const value = Math.min(
    Math.max(...values),
    Math.max(Math.min(...values), model.predict(row)),
  );
  return {
    ...empty,
    value: round(value, 2),
    days: rows.length,
    error: round(error, 2),
    baselineError: round(best.error, 2),
    baseline: best.name,
    trusted: error < best.error * MUST_BEAT,
    drivers,
  };
}

/** The plain guesses of a day from the number's own days before it. */
function selfGuesses(own: Series) {
  const meanOf = (days: LocalDate[]) => {
    const values = days
      .map(one => own.get(one))
      .filter((value): value is number => value !== undefined);
    return values.length ? mean(values) : undefined;
  };
  return {
    yesterday: (day: LocalDate) => own.get(shift(day, -1)),
    week: (day: LocalDate) =>
      meanOf([...Array(7).keys()].map(back => shift(day, -1 - back))),
    weekday: (day: LocalDate) =>
      meanOf(
        [...Array(WEEKDAY_WEEKS).keys()].map(week =>
          shift(day, -7 * (week + 1)),
        ),
      ),
  };
}

function selfFeature(
  target: DailyMetric,
  key: string,
  value: (day: LocalDate) => number | undefined,
): Feature {
  return {
    key,
    labelKey: `life.forecasts.${key}`,
    label: null,
    unit: target.unit,
    ...(target.currency ? {currency: target.currency} : {}),
    value,
  };
}

function isWeekend(day: LocalDate): boolean {
  return [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());
}

interface Fitted {
  /** Per feature: the target's change for one standard deviation of it. */
  weights: number[];
  predict: (row: (number | undefined)[]) => number;
  /** Per feature: what it adds to this row's prediction (a missing value adds nothing). */
  contributions: (row: (number | undefined)[]) => number[];
}

/**
 * A ridge regression on standardized features: a missing value is the feature's mean (zero
 * after standardizing), so a sparse reading does not drop a day.
 */
export function fit(rows: (number | undefined)[][], target: number[]): Fitted {
  const width = rows[0]?.length ?? 0;
  const known = (j: number) =>
    rows
      .map(row => row[j])
      .filter((value): value is number => value !== undefined);
  const means = [...Array(width).keys()].map(j => mean(known(j)));
  const deviations = [...Array(width).keys()].map(j => {
    const spread = Math.sqrt(
      mean(known(j).map(value => (value - means[j]) ** 2)),
    );
    return spread || 1;
  });
  const standard = (row: (number | undefined)[]) =>
    row.map((value, j) =>
      value === undefined ? 0 : (value - means[j]) / deviations[j],
    );
  const x = rows.map(standard);
  const bias = mean(target);
  const y = target.map(value => value - bias);
  // (XᵀX + λI) w = Xᵀy
  const a = [...Array(width).keys()].map(i =>
    [...Array(width).keys()].map(
      j =>
        x.reduce((sum, row) => sum + row[i] * row[j], 0) +
        (i === j ? RIDGE : 0),
    ),
  );
  const b = [...Array(width).keys()].map(i =>
    x.reduce((sum, row, k) => sum + row[i] * y[k], 0),
  );
  const weights = solve(a, b);
  const contributions = (row: (number | undefined)[]) =>
    standard(row).map((value, j) => value * weights[j]);
  return {
    weights,
    contributions,
    predict: row =>
      bias + contributions(row).reduce((sum, value) => sum + value, 0),
  };
}

/** Gaussian elimination with partial pivoting; the ridge keeps the matrix well behaved. */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let row = 0; row < n; row++) {
      if (row !== col && m[col][col]) {
        const factor = m[row][col] / m[col][col];
        for (let k = col; k <= n; k++) m[row][k] -= factor * m[col][k];
      }
    }
  }
  return m.map((row, i) => (row[i] ? row[n] / row[i] : 0));
}

function mean(values: number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
