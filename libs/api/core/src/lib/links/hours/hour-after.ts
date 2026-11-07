import {HourAfter, HourEvent, HourlyMetric, LocalHour} from '@pd/contracts';
import {benjaminiHochberg, tTwoSidedP} from '../correlations/statistics';
import {
  hourOf,
  mean,
  nextHour,
  previousHour,
  readerOf,
  round,
  splitHour,
  weekdayOf,
} from './local-hours';

/*
 * The hour after an event: what a number does in the hour after it, against the same weekday's
 * same hours without it the hour before — matched so the day's own rhythm (more coding at 10
 * than at 22 anyway) is not taken for the event's doing.
 */

/** Fewer times than this — nothing to say. */
export const MIN_EVENTS = 8;
/** A time needs at least this many matched hours without the event to compare with. */
const MIN_CONTROL = 3;
/** Told when the correction for the number of pairs still leaves it this sure … */
const MAX_Q = 0.1;
/** … and the difference is this large against the number's own spread. */
const MIN_EFFECT = 0.2;

export function hourAfter(
  metrics: HourlyMetric[],
  events: HourEvent[],
): HourAfter[] {
  const found: (HourAfter & {p: number})[] = [];
  for (const event of events) {
    const happened = new Set(event.hours);
    const eventDays = new Set(event.days);
    for (const metric of metrics) {
      if (event.itself?.includes(metric.key)) {
        continue;
      }
      const result = compare(metric, event, happened, eventDays);
      if (result) {
        found.push(result);
      }
    }
  }
  const q = benjaminiHochberg(found.map(one => one.p));
  return found
    .map(({p: _p, ...one}, index) => ({
      ...one,
      q: round(q[index], 4),
      strong: one.strong && q[index] < MAX_Q,
    }))
    .sort((a, b) => Number(b.strong) - Number(a.strong) || a.q - b.q);
}

function compare(
  metric: HourlyMetric,
  event: HourEvent,
  happened: Set<LocalHour>,
  eventDays: Set<string>,
): (HourAfter & {p: number}) | null {
  const read = readerOf(metric);
  // The hours of each weekday and hour both were seen in, without the event the hour before.
  const slots = new Map<string, {hour: LocalHour; value: number}[]>();
  for (const day of metric.days) {
    if (!eventDays.has(day)) {
      continue;
    }
    const weekday = weekdayOf(day);
    for (let at = 0; at < 24; at++) {
      const hour = hourOf(day, at);
      const value = read(hour);
      if (value === undefined || happened.has(previousHour(hour))) {
        continue;
      }
      const slot = `${weekday}|${at}`;
      slots.set(slot, [...(slots.get(slot) ?? []), {hour, value}]);
    }
  }

  const differences: number[] = [];
  const afters: number[] = [];
  const usuals: number[] = [];
  for (const hour of [...happened].sort()) {
    const after = nextHour(hour);
    const value = read(after);
    if (value === undefined) {
      continue;
    }
    const {day, hour: at} = splitHour(after);
    const control = (slots.get(`${weekdayOf(day)}|${at}`) ?? []).filter(
      one => one.hour !== after,
    );
    if (control.length < MIN_CONTROL) {
      continue;
    }
    const usual = mean(control.map(one => one.value));
    afters.push(value);
    usuals.push(usual);
    differences.push(value - usual);
  }
  if (differences.length < MIN_EVENTS) {
    return null;
  }

  const n = differences.length;
  const difference = mean(differences);
  const spread = Math.sqrt(
    mean(differences.map(one => (one - difference) ** 2)) * (n / (n - 1)),
  );
  const all = [...slots.values()].flat().map(one => one.value);
  const allMean = mean(all);
  const metricSpread = Math.sqrt(mean(all.map(one => (one - allMean) ** 2)));
  const t = spread ? difference / (spread / Math.sqrt(n)) : 0;
  return {
    event: event.key,
    outcome: metric.key,
    events: n,
    after: round(mean(afters)),
    usual: round(mean(usuals)),
    difference: round(difference),
    p: spread ? tTwoSidedP(t, n - 1) : 1,
    q: 1,
    strong:
      metricSpread > 0 && Math.abs(difference) / metricSpread >= MIN_EFFECT,
  };
}
