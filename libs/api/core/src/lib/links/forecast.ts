import {DailyMetric, LocalDate, MoodForecast} from '@pd/contracts';
import {daysOf, seriesOf, shift} from './daily-series';
import {MOOD_METRIC} from './mood-insights';

/*
 * Today's mood from yesterday's numbers — the user's own model, trained on their own days: a
 * ridge regression over every daily number of the sections (sleep, steps, hours at the
 * computer, spending, music, the weather…), yesterday's mood and the week's average, and the
 * day of the week. A few hundred days are enough, it explains itself (what pulls the mood up
 * and down), and it is shown only when it beats the plain guess "like the last week".
 */

/** Fewer days with a mood and the next day's mood than this — no model. */
export const MIN_DAYS = 40;
/** A number present on fewer of the days than this share is left out. */
const MIN_COVERAGE = 0.5;
/** The pull towards zero of the weights: a small history must not chase noise. */
const RIDGE = 5;
/** The last share of the days, kept aside to measure it. */
const TEST_SHARE = 0.2;
/** Better than the plain guess by this much, or it is not shown. */
const MUST_BEAT = 0.95;
const DRIVERS = 3;

interface Feature {
  key: string;
  metric: DailyMetric | null;
  /** The value the day before the day forecast. */
  value: (day: LocalDate) => number | undefined;
}

/** The forecast of `target`'s mood from the day before it (`target` is today, usually). */
export function moodForecast(
  metrics: DailyMetric[],
  target: LocalDate,
): MoodForecast {
  const moodMetric = metrics.find(metric => metric.key === MOOD_METRIC);
  const empty: MoodForecast = {
    target,
    mood: null,
    days: 0,
    error: null,
    baselineError: null,
    trusted: false,
    drivers: [],
  };
  if (!moodMetric) {
    return empty;
  }
  const allDays = metrics
    .flatMap(metric => metric.days.map(day => day.day))
    .sort();
  if (!allDays.length) {
    return empty;
  }
  const days = daysOf({from: allDays[0], to: target});
  const mood = new Map(moodMetric.days.map(day => [day.day, day.value]));
  const weekMood = (day: LocalDate) => {
    const values = [...Array(7).keys()]
      .map(back => mood.get(shift(day, -back)))
      .filter((value): value is number => value !== undefined);
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : undefined;
  };

  // The days to learn from: a mood on the day and on the day before.
  const rows = days.filter(day => mood.has(day) && mood.has(shift(day, -1)));
  if (rows.length < MIN_DAYS) {
    return {...empty, days: rows.length};
  }

  const features: Feature[] = [
    {
      key: 'mood.yesterday',
      metric: null,
      value: day => mood.get(shift(day, -1)),
    },
    {key: 'mood.week', metric: null, value: day => weekMood(shift(day, -1))},
    {
      key: 'weekend',
      metric: null,
      value: day =>
        [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()) ? 1 : 0,
    },
  ];
  for (const metric of metrics.filter(item => item.key !== MOOD_METRIC)) {
    const series = seriesOf(metric, days);
    const present = rows.filter(day => series.has(shift(day, -1))).length;
    if (present / rows.length >= MIN_COVERAGE) {
      features.push({
        key: metric.key,
        metric,
        value: day => series.get(shift(day, -1)),
      });
    }
  }

  const matrix = (dayList: LocalDate[]) =>
    dayList.map(day => features.map(feature => feature.value(day)));
  const split = Math.floor(rows.length * (1 - TEST_SHARE));
  const learn = rows.slice(0, split);
  const test = rows.slice(split);

  const trained = fit(
    matrix(learn),
    learn.map(day => mood.get(day) as number),
  );
  const errors = test.map(day =>
    Math.abs(trained.predict(matrix([day])[0]) - (mood.get(day) as number)),
  );
  const baseline = test.map(day =>
    Math.abs((weekMood(shift(day, -1)) ?? 3) - (mood.get(day) as number)),
  );
  const error = mean(errors);
  const baselineError = mean(baseline);

  // The model of all the days answers for the target, and tells what weighs most.
  const model = fit(
    matrix(rows),
    rows.map(day => mood.get(day) as number),
  );
  const forecast = model.predict(matrix([target])[0]);
  const drivers = features
    .map((feature, i) => ({feature, effect: model.weights[i]}))
    .filter(({feature}) => feature.metric)
    .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))
    .slice(0, DRIVERS)
    .map(({feature, effect}) => ({
      key: feature.key,
      labelKey: feature.metric!.labelKey,
      label: feature.metric!.label ?? null,
      // Mood points for a typical day's difference of the number (one standard deviation).
      effect: round(effect, 2),
    }));

  return {
    target,
    mood: round(Math.min(5, Math.max(1, forecast)), 1),
    days: rows.length,
    error: round(error, 2),
    baselineError: round(baselineError, 2),
    trusted: error < baselineError * MUST_BEAT,
    drivers,
  };
}

interface Fitted {
  /** Per feature: the mood change for one standard deviation of it. */
  weights: number[];
  predict: (row: (number | undefined)[]) => number;
}

/**
 * A ridge regression on standardized features: a missing value is the feature's mean (zero
 * after standardizing), so a sparse reading does not drop a day.
 */
export function fit(rows: (number | undefined)[][], target: number[]): Fitted {
  const width = rows[0]?.length ?? 0;
  const means = [...Array(width).keys()].map(j =>
    mean(
      rows
        .map(row => row[j])
        .filter((value): value is number => value !== undefined),
    ),
  );
  const deviations = [...Array(width).keys()].map(j => {
    const values = rows
      .map(row => row[j])
      .filter((value): value is number => value !== undefined);
    const spread = Math.sqrt(
      mean(values.map(value => (value - means[j]) ** 2)),
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
  return {
    weights,
    predict: row =>
      bias +
      standard(row).reduce((sum, value, j) => sum + value * weights[j], 0),
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
