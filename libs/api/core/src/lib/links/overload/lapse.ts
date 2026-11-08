import {DailyMetric, LocalDate} from '@pd/contracts';
import {daysOf, seriesOf, shift} from '../daily-series';
import {fit} from '../forecast';

/*
 * The chance a habit lapses tomorrow (the owner's idea): from the day's numbers — the phone,
 * late games, the mood, sleep — by the user's own days, a model of what came the day after.
 * Trusted only when it guesses better than "as often as it usually lapses".
 */

/** Fewer days with the habit than this — no model. */
const MIN_DAYS = 40;
/** Fewer lapses (or fewer kept days) than this — nothing to learn from. */
const MIN_EACH = 5;
const MIN_COVERAGE = 0.5;
const TEST_SHARE = 0.2;
/** Better than the plain rate by this much (in the squared miss), or not trusted. */
const MUST_BEAT = 0.95;
/** Told when this likely, and this much above the usual rate. */
const HIGH_CHANCE = 0.6;
const ABOVE_USUAL = 0.15;
const DRIVERS = 3;

export interface LapseChance {
  key: string;
  /** Tomorrow's chance of a lapse, 0–1; `null` — no model. */
  chance: number | null;
  /** How often it lapses, on the days learnt from. */
  usual: number | null;
  days: number;
  trusted: boolean;
  /** Likely enough, and well above the usual, to tell in the evening. */
  high: boolean;
  /** What pushes tomorrow's chance up most (keys and what they add). */
  drivers: {key: string; effect: number}[];
}

/**
 * Tomorrow's chance of `habit` lapsing (`lapse` — which of its values is one), from `today`'s
 * numbers (the day so far) of every other section.
 */
export function lapseChance(
  metrics: DailyMetric[],
  habit: DailyMetric,
  lapse: 'marked' | 'unmarked',
  today: LocalDate,
): LapseChance {
  const empty: LapseChance = {
    key: habit.key,
    chance: null,
    usual: null,
    days: 0,
    trusted: false,
    high: false,
    drivers: [],
  };
  const known = habit.days.map(one => one.day).sort();
  if (!known.length) {
    return empty;
  }
  const days = daysOf({from: known[0], to: shift(today, 1)});
  const own = seriesOf(habit, days);
  const lapsed = (day: LocalDate) => {
    const value = own.get(day);
    return value === undefined
      ? undefined
      : (lapse === 'marked' ? value > 0 : value <= 0)
        ? 1
        : 0;
  };
  // The days learnt from: the habit known on the day after, and that day over — today is not
  // (a daily habit not marked yet this evening is no lapse).
  const rows = days.filter(
    day => shift(day, 1) < today && lapsed(shift(day, 1)) !== undefined,
  );
  const outcomes = rows.map(day => lapsed(shift(day, 1)) as number);
  const lapses = outcomes.reduce((sum, one) => sum + one, 0);
  if (
    rows.length < MIN_DAYS ||
    lapses < MIN_EACH ||
    rows.length - lapses < MIN_EACH
  ) {
    return {...empty, days: rows.length};
  }

  const features = metrics
    .filter(metric => metric.key !== habit.key && metric.module !== 'habits')
    .map(metric => ({key: metric.key, series: seriesOf(metric, days)}))
    .filter(
      ({series}) =>
        rows.filter(day => series.has(day)).length / rows.length >=
        MIN_COVERAGE,
    );
  // Whether it lapsed today: a lapse often follows a lapse. Today's own is not known yet in the
  // evening (a daily one may still be done), so it counts as usual.
  const rowOf = (day: LocalDate) => [
    day === today ? undefined : lapsed(day),
    ...features.map(({series}) => series.get(day)),
  ];
  const split = Math.floor(rows.length * (1 - TEST_SHARE));
  const learn = rows.slice(0, split);
  const test = rows.slice(split);
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const trained = fit(learn.map(rowOf), outcomes.slice(0, split));
  const usualRate = mean(outcomes.slice(0, split));
  const miss = (guess: (day: LocalDate) => number) =>
    mean(test.map((day, index) => (guess(day) - outcomes[split + index]) ** 2));
  const modelMiss = miss(day => clamp(trained.predict(rowOf(day))));
  const plainMiss = miss(() => usualRate);

  const model = fit(rows.map(rowOf), outcomes);
  const row = rowOf(today);
  const chance = clamp(model.predict(row));
  const usual = mean(outcomes);
  const trusted = modelMiss < plainMiss * MUST_BEAT;
  const contributions = model.contributions(row);
  const keys = ['self.lapsedToday', ...features.map(one => one.key)];
  return {
    key: habit.key,
    chance: round(chance),
    usual: round(usual),
    days: rows.length,
    trusted,
    high: trusted && chance >= HIGH_CHANCE && chance - usual >= ABOVE_USUAL,
    drivers: contributions
      .map((effect, index) => ({key: keys[index], effect: round(effect)}))
      .filter(one => one.effect > 0)
      .sort((a, b) => b.effect - a.effect)
      .slice(0, DRIVERS),
  };
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
