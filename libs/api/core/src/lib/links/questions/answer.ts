import {
  Confounder,
  CONFOUNDERS,
  LocalDate,
  QuestionAnswer,
} from '@pd/contracts';
import {median, tTwoSidedP} from '../correlations/statistics';
import {Series, shift} from '../daily-series';

/*
 * The answer to "does A go with B?" over the days: the days of more A against the days of less
 * (above and below its own middle), B on the same or the next day in each, how sure, and whether
 * it holds within each of what could explain it away (weekends, rain, illness, travel) and, if
 * asked, only when C is high or low.
 */

/** Fewer days than this — not enough to say. */
export const MIN_DAYS = 20;
/** Each side needs this many days. */
const MIN_SIDE = 5;
/** Within a part (weekdays only…), each side needs this many days to count. */
const MIN_PART_SIDE = 3;
const MAX_P = 0.05;
/** Large enough: a fifth of B's own spread. */
const MIN_EFFECT = 0.2;
/** It holds when the difference within the parts keeps its sign and half its size. */
const HOLDS_SHARE = 0.5;

/** For each confounder, whether a day is of it (`undefined` — not known). */
export type Strata = Record<
  Confounder,
  (day: LocalDate) => boolean | undefined
>;

export function answerDays(
  cause: Series,
  effect: Series,
  lag: 0 | 1,
  strata: Strata,
  condition?: Series,
): QuestionAnswer {
  const empty: QuestionAnswer = {
    status: 'few',
    n: 0,
    threshold: null,
    high: null,
    low: null,
    difference: null,
    p: null,
    strong: false,
    confounders: [],
    condition: null,
  };
  const days = [...cause.keys()].filter(day => effect.has(shift(day, lag)));
  if (days.length < MIN_DAYS) {
    return {...empty, n: days.length};
  }
  const threshold = median(days.map(day => cause.get(day) as number));
  const isHigh = (day: LocalDate) => (cause.get(day) as number) > threshold;
  const of = (day: LocalDate) => effect.get(shift(day, lag)) as number;
  const split = (list: LocalDate[]) => ({
    high: list.filter(isHigh).map(of),
    low: list.filter(day => !isHigh(day)).map(of),
  });
  const {high, low} = split(days);
  if (high.length < MIN_SIDE || low.length < MIN_SIDE) {
    return {...empty, n: days.length, threshold};
  }
  const difference = mean(high) - mean(low);
  const all = days.map(of);
  const spread = Math.sqrt(variance(all));

  // Within each part separately, weighted by its days: does the difference survive?
  const within = (inPart: (day: LocalDate) => boolean | undefined) => {
    let weighted = 0;
    let weight = 0;
    let parts = 0;
    for (const value of [true, false]) {
      const part = split(days.filter(day => inPart(day) === value));
      if (
        part.high.length >= MIN_PART_SIDE &&
        part.low.length >= MIN_PART_SIDE
      ) {
        const size = part.high.length + part.low.length;
        weighted += (mean(part.high) - mean(part.low)) * size;
        weight += size;
        parts++;
      }
    }
    return parts === 2 ? weighted / weight : null;
  };
  const confounders = CONFOUNDERS.map(confounder => {
    const held = within(strata[confounder]);
    return {
      confounder,
      holds:
        held === null
          ? null
          : Math.sign(held) === Math.sign(difference) &&
            Math.abs(held) >= Math.abs(difference) * HOLDS_SHARE,
    };
  });

  let conditional: QuestionAnswer['condition'] = null;
  if (condition) {
    const known = days.filter(day => condition.has(day));
    const middle = median(known.map(day => condition.get(day) as number));
    const differenceOf = (wanted: boolean) => {
      const part = split(
        known.filter(day => (condition.get(day) as number) > middle === wanted),
      );
      return part.high.length >= MIN_PART_SIDE &&
        part.low.length >= MIN_PART_SIDE
        ? round(mean(part.high) - mean(part.low))
        : null;
    };
    conditional = {whenHigh: differenceOf(true), whenLow: differenceOf(false)};
  }

  const p = welchP(high, low);
  return {
    status: 'answered',
    n: days.length,
    threshold: round(threshold),
    high: round(mean(high)),
    low: round(mean(low)),
    difference: round(difference),
    p: round(p, 4),
    strong:
      p < MAX_P && spread > 0 && Math.abs(difference) / spread >= MIN_EFFECT,
    confounders,
    condition: conditional,
  };
}

/** Welch's t-test of two groups, two-sided. */
function welchP(a: number[], b: number[]): number {
  const [va, vb] = [variance(a) / a.length, variance(b) / b.length];
  const se = Math.sqrt(va + vb);
  if (!se) {
    return mean(a) === mean(b) ? 1 : 0;
  }
  const t = (mean(a) - mean(b)) / se;
  const df =
    (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1) || 1);
  return tTwoSidedP(t, Math.max(1, df));
}

function mean(values: number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function variance(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const middle = mean(values);
  return (
    values.reduce((sum, value) => sum + (value - middle) ** 2, 0) /
    (values.length - 1)
  );
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
