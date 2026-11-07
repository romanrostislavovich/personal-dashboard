import {DailyMetric, LocalDate} from '@pd/contracts';
import {daysOf, seriesOf, shift} from '../daily-series';

/*
 * The overload score (the owner's "burnout forecast", named "overload" on purpose — it is not
 * a diagnosis): the last few days against the user's own usual, of the numbers that move when a
 * stretch gets heavy — more phone at night and a restless phone, less sleep, deep work, commits
 * and a lower mood. Each in its own spread, so none outweighs the rest by its unit.
 */

/** A signal of overload and which way it moves when it gets heavy. */
export const OVERLOAD_SIGNALS: {key: string; heavier: 1 | -1}[] = [
  {key: 'activity.phone.night', heavier: 1},
  {key: 'activity.index.phone.restlessness', heavier: 1},
  {key: 'health.band.sleep', heavier: -1},
  {key: 'activity.index.deepWork', heavier: -1},
  {key: 'development.commits', heavier: -1},
  {key: 'diary.mood', heavier: -1},
];

/** The days of "lately". */
export const RECENT_DAYS = 5;
/** The usual: the four weeks before them. */
const USUAL_DAYS = 28;
/** A day is scored only with this many signals known. */
const MIN_SIGNALS = 3;
/** A signal is known lately with this many days, and usually with this many. */
const MIN_RECENT = 3;
const MIN_USUAL = 10;
/** A single signal moves the score this far at most (in its spreads). */
const CAP = 3;
/** High: above nine of ten of the user's own past scores, and at least this. */
const HIGH_SHARE = 0.9;
const MIN_HIGH = 0.75;
/** The past scores the threshold is taken from need this many days. */
const MIN_HISTORY = 30;

export interface OverloadPart {
  key: string;
  /** The last days' mean and the usual one, in the number's unit. */
  recent: number;
  usual: number;
  /** How much heavier, in the usual spread (positive — heavier). */
  weight: number;
}

/** The score of a day: the mean of the signals' weights; `null` — too few known. */
export function overloadOn(
  metrics: DailyMetric[],
  day: LocalDate,
): {score: number; parts: OverloadPart[]} | null {
  const from = shift(day, -(RECENT_DAYS + USUAL_DAYS) + 1);
  const days = daysOf({from, to: day});
  const recentFrom = shift(day, -RECENT_DAYS + 1);
  const parts: OverloadPart[] = [];
  for (const signal of OVERLOAD_SIGNALS) {
    const metric = metrics.find(one => one.key === signal.key);
    if (!metric) {
      continue;
    }
    const series = seriesOf(metric, days);
    const values = (inRecent: boolean) =>
      days
        .filter(one => one >= recentFrom === inRecent && series.has(one))
        .map(one => series.get(one) as number);
    const recent = values(true);
    const usual = values(false);
    if (recent.length < MIN_RECENT || usual.length < MIN_USUAL) {
      continue;
    }
    const usualMean = mean(usual);
    const spread = Math.sqrt(mean(usual.map(one => (one - usualMean) ** 2)));
    if (!spread) {
      continue;
    }
    const weight = ((mean(recent) - usualMean) / spread) * signal.heavier;
    parts.push({
      key: signal.key,
      recent: round(mean(recent)),
      usual: round(usualMean),
      weight: round(Math.max(-CAP, Math.min(CAP, weight))),
    });
  }
  if (parts.length < MIN_SIGNALS) {
    return null;
  }
  return {
    score: round(mean(parts.map(one => one.weight))),
    parts: parts.sort((a, b) => b.weight - a.weight),
  };
}

/** The scores of the days up to `to`, the oldest first (a day too thin is left out). */
export function overloadHistory(
  metrics: DailyMetric[],
  from: LocalDate,
  to: LocalDate,
): {day: LocalDate; score: number}[] {
  return daysOf({from, to}).flatMap(day => {
    const found = overloadOn(metrics, day);
    return found ? [{day, score: found.score}] : [];
  });
}

/**
 * The user's own "high": above nine of ten of their past scores (`null` — too few to say);
 * never below MIN_HIGH, so a calm life does not make an ordinary day alarming.
 */
export function overloadThreshold(scores: number[]): number | null {
  if (scores.length < MIN_HISTORY) {
    return null;
  }
  const sorted = [...scores].sort((a, b) => a - b);
  return round(
    Math.max(MIN_HIGH, sorted[Math.floor(sorted.length * HIGH_SHARE)]),
  );
}

function mean(values: number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
