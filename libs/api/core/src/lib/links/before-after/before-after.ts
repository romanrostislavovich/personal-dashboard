import {
  BeforeAfter,
  BeforeAfterChange,
  BeforeAfterEvent,
  BeforeAfterResult,
  DailyMetric,
  LocalDate,
  TimelinePeriod,
} from '@pd/contracts';
import { daysOf, READINGS, round, seriesOf, SURROUNDINGS } from '../daily-series';
import { benjaminiHochberg, mean, tTwoSidedP } from '../correlations/statistics';

/** Fewer days with a value on either side, and the two averages say nothing. */
export const MIN_WINDOW_DAYS = 7;
/** Fewer ordinary dates to compare with, and there is no telling a change from the usual. */
const MIN_PLACEBOS = 20;
/** The least degrees of freedom of the comparison: a short history is judged strictly. */
const MIN_WINDOWS = 3;
/** A change is shown as one when its corrected p-value is under this. */
const MAX_Q = 0.1;

/**
 * Before and after the dates a life may have changed at — the start or the end of a period
 * Health tells (a diagnosis, a medication): for every daily number of the person, the average
 * of the weeks before against the weeks after.
 *
 * Whether the change is more than the usual comes from the number itself: the same comparison
 * is made at every other date of its history (a placebo test), and the change at the event is
 * measured in the spread of those ordinary changes. The seasons, the trends and the likeness of
 * the days that follow each other are all in that spread, with nothing assumed about them. It is an
 * observation, not a medical judgement — the page says so.
 */
export function beforeAfter(
  metrics: DailyMetric[],
  periods: TimelinePeriod[],
  range: { from: LocalDate; to: LocalDate },
  weeks: number,
): BeforeAfter {
  const days = daysOf(range);
  const index = new Map(days.map((day, i) => [day, i]));
  const own = metrics
    .filter((metric) => !SURROUNDINGS.has(metric.module))
    .map((metric) => ({ metric, sums: prefixSums(seriesOf(metric, days), days) }));
  const window = weeks * 7;
  const results = eventsOf(periods, range.to)
    .filter((event) => index.has(event.on))
    .map((event) => compareAround(event, index.get(event.on) as number, days, own, window));
  return { weeks, results };
}

/** The starts and the ends of the periods that have come, the latest first. */
export function eventsOf(periods: TimelinePeriod[], today: LocalDate): BeforeAfterEvent[] {
  const events = new Map<string, BeforeAfterEvent>();
  for (const period of periods) {
    // A period of one day (an event of a life) is one date, not a start and an end.
    const edges: [BeforeAfterEvent['edge'], LocalDate | null][] = [
      ['start', period.from],
      ['end', period.to === period.from ? null : period.to],
    ];
    for (const [edge, on] of edges) {
      if (on && on <= today) {
        const id = [period.module, period.kind, period.title, on, edge].join('|');
        events.set(id, {
          id,
          module: period.module,
          kind: period.kind,
          title: period.title,
          subtitle: period.subtitle,
          on,
          edge,
        });
      }
    }
  }
  return [...events.values()].sort((a, b) => b.on.localeCompare(a.on));
}

interface Sums {
  /** Sums and counts of the values up to each day: any window's average in one step. */
  sum: number[];
  count: number[];
  values: (number | undefined)[];
}

function prefixSums(series: Map<LocalDate, number>, days: LocalDate[]): Sums {
  const sum = [0];
  const count = [0];
  const values = days.map((day) => series.get(day));
  values.forEach((value, i) => {
    sum.push(sum[i] + (value ?? 0));
    count.push(count[i] + (value === undefined ? 0 : 1));
  });
  return { sum, count, values };
}

/** The average and the days with a value of the days `from`…`to` (indices, inclusive). */
function windowOf(sums: Sums, from: number, to: number): { mean: number; days: number } {
  const [a, b] = [Math.max(0, from), Math.min(sums.values.length - 1, to)];
  if (b < a) {
    return { mean: 0, days: 0 };
  }
  const days = sums.count[b + 1] - sums.count[a];
  return { mean: days ? (sums.sum[b + 1] - sums.sum[a]) / days : 0, days };
}

/** The change at a date: `null` when either side has too few days with a value. */
function changeAt(sums: Sums, at: number, before: number, after: number) {
  const left = windowOf(sums, at - before, at - 1);
  const right = windowOf(sums, at, at + after - 1);
  if (left.days < MIN_WINDOW_DAYS || right.days < MIN_WINDOW_DAYS) {
    return null;
  }
  return { left, right, difference: right.mean - left.mean };
}

function compareAround(
  event: BeforeAfterEvent,
  at: number,
  days: LocalDate[],
  own: { metric: DailyMetric; sums: Sums }[],
  window: number,
): BeforeAfterResult {
  // A recent event: as many days after it as there are so far.
  const after = Math.min(window, days.length - at);
  if (after < MIN_WINDOW_DAYS) {
    return { event, daysAfter: after, enough: false, changes: [] };
  }
  const found: Omit<BeforeAfterChange, 'q' | 'changed'>[] = [];
  for (const { metric, sums } of own) {
    const change = changeAt(sums, at, window, after);
    if (!change) {
      continue;
    }
    found.push({
      key: metric.key,
      module: metric.module,
      labelKey: metric.labelKey,
      ...(metric.label ? { label: metric.label } : {}),
      unit: metric.unit,
      ...(metric.currency ? { currency: metric.currency } : {}),
      before: round(change.left.mean, 3),
      after: round(change.right.mean, 3),
      daysBefore: change.left.days,
      daysAfter: change.right.days,
      difference: round(change.difference, 3),
      differencePercent:
        READINGS.includes(metric.unit) || !change.left.mean
          ? null
          : Math.round((change.difference / Math.abs(change.left.mean)) * 100),
      p: placebo(sums, at, window, after, change.difference),
      values: valuesAround(sums, days, at - window, at + after - 1),
    });
  }
  const tested = found.filter((change) => change.p !== null);
  const q = benjaminiHochberg(tested.map((change) => change.p as number));
  const changes: BeforeAfterChange[] = found.map((change) => {
    const corrected = change.p === null ? null : round(q[tested.indexOf(change)], 4);
    return { ...change, q: corrected, changed: corrected !== null && corrected < MAX_Q };
  });
  changes.sort((a, b) => Number(b.changed) - Number(a.changed) || (a.p ?? 2) - (b.p ?? 2));
  return { event, daysAfter: after, enough: true, changes };
}

/**
 * How far the change at the event lies beyond the changes at the ordinary dates — those whose
 * windows do not touch the event's: their spread is what the number does by itself (seasons,
 * trends, slow weeks), and the change is measured in it, by Student's t. The degrees of freedom
 * are the windows that fit apart in that history, as neighbouring dates share most of their
 * days. `null` when the history has too few ordinary dates.
 */
function placebo(sums: Sums, at: number, before: number, after: number, observed: number) {
  const changes: number[] = [];
  for (let date = before; date + after <= sums.values.length; date++) {
    const apart = date + after - 1 < at - before || date - before > at + after - 1;
    const change = apart ? changeAt(sums, date, before, after) : null;
    if (change) {
      changes.push(change.difference);
    }
  }
  if (changes.length < MIN_PLACEBOS) {
    return null;
  }
  const usual = mean(changes);
  const spread = Math.sqrt(
    changes.reduce((sum, change) => sum + (change - usual) ** 2, 0) / (changes.length - 1),
  );
  const distance = Math.abs(observed - usual);
  if (!spread) {
    return distance > 1e-9 ? 0 : 1;
  }
  const windows = Math.max(MIN_WINDOWS, Math.floor(changes.length / after));
  return round(tTwoSidedP(distance / spread, windows), 6);
}

function valuesAround(sums: Sums, days: LocalDate[], from: number, to: number) {
  const values: { day: LocalDate; value: number }[] = [];
  for (let i = Math.max(0, from); i <= Math.min(days.length - 1, to); i++) {
    const value = sums.values[i];
    if (value !== undefined) {
      values.push({ day: days[i], value: round(value, 3) });
    }
  }
  return values;
}
