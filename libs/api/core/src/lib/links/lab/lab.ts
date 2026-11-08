import {ExperimentCondition, ExperimentResult, LocalDate} from '@pd/contracts';
import {daysOf} from '../daily-series';

/*
 * The personal lab (docs/proposals/personal-lab.md): a small everyday change tried by rules
 * chosen beforehand — ordinary and changed days in a random order made before the start, as
 * many of each on weekdays as on weekends — and a calm description of what came of it, with
 * how sure it is. It describes; it does not prove.
 */

/** Fewer days of either kind than this — "not enough yet". */
export const MIN_EACH = 6;
const RESAMPLES = 2000;
/** The middle 95 % of the resampled differences. */
const LOW = 0.025;
const HIGH = 0.975;

/**
 * The days from `startOn` for `days` days, each ordinary or changed: within weekdays and within
 * weekends half and half, in a random order (`random` for a test's own).
 */
export function makeSchedule(
  startOn: LocalDate,
  days: number,
  random: () => number = Math.random,
): {day: LocalDate; condition: ExperimentCondition}[] {
  const all = daysOf({from: startOn, to: addDays(startOn, days - 1)});
  const weekend = (day: LocalDate) =>
    [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());
  const conditionOf = new Map<LocalDate, ExperimentCondition>();
  for (const group of [all.filter(weekend), all.filter(day => !weekend(day))]) {
    // Half of each, the odd one by a coin; then shuffled.
    const changed =
      Math.floor(group.length / 2) +
      (group.length % 2 && random() < 0.5 ? 1 : 0);
    const conditions = group.map((_, index) =>
      index < changed ? ('changed' as const) : ('ordinary' as const),
    );
    for (let i = conditions.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [conditions[i], conditions[j]] = [conditions[j], conditions[i]];
    }
    group.forEach((day, index) => conditionOf.set(day, conditions[index]));
  }
  return all.map(day => ({
    day,
    condition: conditionOf.get(day) as ExperimentCondition,
  }));
}

/**
 * What came of it so far: each kind of day's mean and spread, the difference (changed minus
 * ordinary) and the middle 95 % of it when the days are resampled. A day without a value is
 * missing — never a zero; a day the change was not kept is left out and counted.
 */
export function experimentResult(
  days: {
    condition: ExperimentCondition;
    value: number | null;
    kept: boolean | null;
  }[],
  random: () => number = seeded(1),
): ExperimentResult {
  const kept = days.filter(day => day.kept !== false);
  const of = (condition: ExperimentCondition) =>
    kept
      .filter(day => day.condition === condition && day.value !== null)
      .map(day => day.value as number);
  const ordinary = of('ordinary');
  const changed = of('changed');
  const group = (values: number[]) => ({
    n: values.length,
    mean: values.length ? round(mean(values)) : null,
    spread: values.length > 1 ? round(Math.sqrt(variance(values))) : null,
  });
  const enough = ordinary.length >= MIN_EACH && changed.length >= MIN_EACH;
  let interval: [number, number] | null = null;
  if (enough) {
    const differences: number[] = [];
    for (let i = 0; i < RESAMPLES; i++) {
      differences.push(
        mean(resample(changed, random)) - mean(resample(ordinary, random)),
      );
    }
    differences.sort((a, b) => a - b);
    interval = [
      round(differences[Math.floor(RESAMPLES * LOW)]),
      round(differences[Math.floor(RESAMPLES * HIGH) - 1]),
    ];
  }
  return {
    ordinary: group(ordinary),
    changed: group(changed),
    difference:
      ordinary.length && changed.length
        ? round(mean(changed) - mean(ordinary))
        : null,
    interval,
    enough,
    notKept: days.filter(day => day.kept === false).length,
    missing: days.filter(day => day.value === null).length,
  };
}

function resample(values: number[], random: () => number): number[] {
  return values.map(() => values[Math.floor(random() * values.length)]);
}

/** A repeatable random (the same days give the same interval on every look). */
export function seeded(seed: number): () => number {
  let state = seed % 2147483647 || 1;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function addDays(day: LocalDate, days: number): LocalDate {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
}

function variance(values: number[]): number {
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
