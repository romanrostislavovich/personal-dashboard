import {DailyMetric, LocalDate} from '@pd/contracts';
import {daysOf, round, seriesOf} from './daily-series';
import {mean, median, pearson} from './correlations/statistics';

/** A level holds at least this many days with a value on each side of a change. */
export const MIN_SEGMENT = 21;
/**
 * How sure a change must be: the difference of the two levels in its standard errors, the
 * days' likeness to their neighbours allowed for. High on purpose — every day of a history is
 * tried as the split, and a calm message must not be sent about noise.
 */
const MIN_T = 5;
/** …and how large: at least this share of the days' spread around their level. */
const MIN_EFFECT = 0.5;
/** Halves searched again for more changes, at most this deep (2⁴ levels). */
const MAX_DEPTH = 4;
/** Days on each side of a day its local level (a running median) is taken over. */
const LOCAL_DAYS = 7;

/** A day a number's level changed at. */
export interface ChangePoint {
  key: string;
  /** The first day of the new level. */
  day: LocalDate;
  /** The median of the level before and of the one after (to the neighbouring changes). */
  before: number;
  after: number;
  /** The difference of the levels in the days' spread around them: how large the change is. */
  effect: number;
}

/** How a number varies from day to day around its local level, see noiseOf. */
interface Noise {
  spread: number;
  /** How alike neighbouring days are, 0–1: the independent days are fewer by it. */
  shrink: number;
}

/**
 * When the level of each number changed ("since about 12 September the late-night phone is up
 * by 40 minutes"): binary segmentation — the split of the days that sets the two means furthest
 * apart, kept when sure and large enough (see MIN_T, MIN_EFFECT), then the same in each half.
 */
export function changePoints(
  metrics: DailyMetric[],
  period: {from: LocalDate; to: LocalDate},
): ChangePoint[] {
  const days = daysOf(period);
  return metrics.flatMap(metric => {
    const series = seriesOf(metric, days);
    const known = days.filter(day => series.has(day));
    const values = known.map(day => series.get(day) as number);
    const noise = noiseOf(values);
    if (!noise) {
      return [];
    }
    const splits = splitsOf(values, noise, 0, values.length, 0).sort(
      (a, b) => a - b,
    );
    const edges = [0, ...splits, values.length];
    return splits.map((split, index): ChangePoint => {
      const before = values.slice(edges[index], split);
      const after = values.slice(split, edges[index + 2]);
      return {
        key: metric.key,
        day: known[split],
        before: round(median(before), 3),
        after: round(median(after), 3),
        effect: round(Math.abs(mean(after) - mean(before)) / noise.spread, 3),
      };
    });
  });
}

/** The splits of values[start, end), the surest first found. */
function splitsOf(
  values: number[],
  noise: Noise,
  start: number,
  end: number,
  depth: number,
): number[] {
  if (depth >= MAX_DEPTH || end - start < 2 * MIN_SEGMENT) {
    return [];
  }
  const split = bestSplit(values, noise, start, end);
  if (split === null) {
    return [];
  }
  return [
    split,
    ...splitsOf(values, noise, start, split, depth + 1),
    ...splitsOf(values, noise, split, end, depth + 1),
  ];
}

/**
 * The day-to-day spread and likeness, measured around a running median: a change of level not
 * found yet would otherwise count as noise and hide itself and the others.
 */
function noiseOf(values: number[]): Noise | null {
  if (values.length < 2 * MIN_SEGMENT) {
    return null;
  }
  const residuals = values.map(
    (value, index) =>
      value -
      median(
        values.slice(Math.max(0, index - LOCAL_DAYS), index + LOCAL_DAYS + 1),
      ),
  );
  const m = mean(residuals);
  const spread = Math.sqrt(
    residuals.reduce((sum, value) => sum + (value - m) ** 2, 0) /
      (residuals.length - 1),
  );
  if (!spread) {
    return null;
  }
  const auto = Math.max(
    0,
    pearson(residuals.slice(0, -1), residuals.slice(1)) || 0,
  );
  return {spread, shrink: (1 - auto) / (1 + auto)};
}

/** The split that sets the two means furthest apart, if it is sure and large enough. */
function bestSplit(
  values: number[],
  noise: Noise,
  start: number,
  end: number,
): number | null {
  const part = values.slice(start, end);
  const n = part.length;
  const prefix = [0];
  for (const value of part) {
    prefix.push(prefix[prefix.length - 1] + value);
  }
  let best = -1;
  let bestScore = 0;
  for (let k = MIN_SEGMENT; k <= n - MIN_SEGMENT; k++) {
    const left = prefix[k] / k;
    const right = (prefix[n] - prefix[k]) / (n - k);
    // The CUSUM score: the difference weighted by how evenly the days are split.
    const score = Math.abs(left - right) * Math.sqrt((k * (n - k)) / n);
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  if (best < 0) {
    return null;
  }
  const difference = Math.abs(
    prefix[best] / best - (prefix[n] - prefix[best]) / (n - best),
  );
  // Neighbouring days are alike: fewer independent days than days (as in the links).
  const error =
    noise.spread *
    Math.sqrt(1 / (best * noise.shrink) + 1 / ((n - best) * noise.shrink));
  return difference / error >= MIN_T && difference / noise.spread >= MIN_EFFECT
    ? start + best
    : null;
}
