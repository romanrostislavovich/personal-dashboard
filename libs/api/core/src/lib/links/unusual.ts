import {DailyMetric, LocalDate, UnusualDay, UnusualNumber} from '@pd/contracts';
import {daysOf, round, seriesOf, shift} from './daily-series';
import {median} from './correlations/statistics';

/** The baseline: the days before the day compared with it. */
export const BASELINE_DAYS = 28;
/** For a number that differs by the kind of day: the same kind over this many days. */
const KIND_DAYS = 56;
/** Fewer days to compare with than this, and nothing is unusual. */
const MIN_DAYS = 14;
const MIN_KIND_DAYS = 8;
/** Unusual: beyond the values of at least this share of the baseline's days (9 of 10). */
export const UNUSUAL_SHARE = 0.9;
/**
 * A number differs by the kind of day when the medians of weekends and of weekdays are further
 * apart than this share of its spread (the middle half of its values).
 */
const KIND_GAP = 0.5;

/** The days before `day` the unusual numbers of it are counted from. */
export function unusualPeriod(day: LocalDate): {
  from: LocalDate;
  to: LocalDate;
} {
  return {from: shift(day, -KIND_DAYS), to: day};
}

/**
 * The numbers of a day far from their usual level: further than on 9 of 10 days of the baseline
 * — the last 28 days, or for a number that differs between weekends and weekdays the same kind
 * of day of the last eight weeks. A day not over (`complete` false) is unusual only upwards: its
 * sums can still grow. "Beyond 9 of 10" counts ties against it, so a value seen on one day of
 * ten (a tag used now and then) is not unusual each time.
 */
export function unusualOn(
  metrics: DailyMetric[],
  day: LocalDate,
  complete: boolean,
): UnusualDay {
  const days = daysOf(unusualPeriod(day));
  const numbers = metrics.flatMap((metric): UnusualNumber[] => {
    const series = seriesOf(metric, days);
    const value = series.get(day);
    if (value === undefined) {
      return [];
    }
    const base = baselineOf(series, day);
    if (!base) {
      return [];
    }
    const below = base.values.filter(one => one < value).length;
    const above = base.values.filter(one => one > value).length;
    const n = base.values.length;
    const direction =
      below / n >= UNUSUAL_SHARE
        ? 'up'
        : complete && above / n >= UNUSUAL_SHARE
          ? 'down'
          : null;
    if (!direction) {
      return [];
    }
    const {key, module, labelKey, label, unit, currency, extra, outcome} =
      metric;
    return [
      {
        key,
        module,
        labelKey,
        ...(label ? {label} : {}),
        unit,
        ...(currency ? {currency} : {}),
        ...(extra ? {extra} : {}),
        ...(outcome ? {outcome} : {}),
        value: round(value, 3),
        usual: round(median(base.values), 3),
        direction,
        beyond: round((direction === 'up' ? below : above) / n, 3),
        days: n,
        baseline: base.kind ? 'kind' : 'days',
      },
    ];
  });
  return {
    day,
    complete,
    numbers: numbers.sort(
      (a, b) =>
        b.beyond - a.beyond ||
        Number(Boolean(b.outcome)) - Number(Boolean(a.outcome)) ||
        Number(Boolean(a.extra)) - Number(Boolean(b.extra)),
    ),
  };
}

/** The values the day is compared with, or `null` when there are too few. */
function baselineOf(
  series: Map<LocalDate, number>,
  day: LocalDate,
): {values: number[]; kind: boolean} | null {
  const before = (count: number) =>
    daysOf({from: shift(day, -count), to: shift(day, -1)}).filter(one =>
      series.has(one),
    );
  const recent = before(BASELINE_DAYS);
  const wide = before(KIND_DAYS);
  if (differsByKind(series, wide)) {
    const same = wide.filter(one => isWeekend(one) === isWeekend(day));
    return same.length >= MIN_KIND_DAYS
      ? {values: same.map(one => series.get(one) as number), kind: true}
      : null;
  }
  return recent.length >= MIN_DAYS
    ? {values: recent.map(one => series.get(one) as number), kind: false}
    : null;
}

function differsByKind(
  series: Map<LocalDate, number>,
  days: LocalDate[],
): boolean {
  const weekend = days.filter(isWeekend).map(one => series.get(one) as number);
  const weekdays = days
    .filter(one => !isWeekend(one))
    .map(one => series.get(one) as number);
  if (weekend.length < MIN_KIND_DAYS || weekdays.length < MIN_KIND_DAYS) {
    return false;
  }
  const all = [...weekend, ...weekdays].sort((a, b) => a - b);
  const spread =
    all[Math.floor(all.length * 0.75)] - all[Math.floor(all.length * 0.25)];
  const gap = Math.abs(median(weekend) - median(weekdays));
  return spread > 0 ? gap > KIND_GAP * spread : gap > 0;
}

function isWeekend(day: LocalDate): boolean {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}
