import { addDays, DailyMetric, LocalDate, parseLocalDate, toLocalDate } from '@pd/contracts';

/*
 * A daily number as a series of days, as the links engine and "before and after" read it: a
 * reading (a temperature, a score) has a value only on the days it was taken; a quantity
 * (hours, money, plays) counts from its first day to its last, its empty days as zero.
 */

/** A day a reading does not have is left out; a quantity's empty day is a zero. */
export const READINGS: DailyMetric['unit'][] = ['degrees', 'clock', 'score', 'percent'];

/**
 * Sections of what happens around the person (the weather, the calendar), not the person's
 * own numbers.
 */
export const SURROUNDINGS = new Set(['weather', 'life']);

export type Series = Map<LocalDate, number>;

/** The values of a number on the days of a period, in order. */
export function seriesOf(metric: DailyMetric, days: LocalDate[]): Series {
  const given = new Map(metric.days.map((day) => [day.day, day.value]));
  const series: Series = new Map();
  if (READINGS.includes(metric.unit)) {
    for (const day of days) {
      if (given.has(day)) {
        series.set(day, given.get(day) as number);
      }
    }
    return series;
  }
  // A quantity counts from its first day to its last: before it the section was not used.
  const known = days.filter((day) => given.has(day));
  const [first, last] = [known[0], known[known.length - 1]];
  for (const day of days) {
    if (first && day >= first && day <= last) {
      series.set(day, given.get(day) ?? 0);
    }
  }
  return series;
}

/** Every day of a period (ten years at most). */
export function daysOf({ from, to }: { from: LocalDate; to: LocalDate }): LocalDate[] {
  const days: LocalDate[] = [];
  for (let day = from; day <= to && days.length < 3700; day = shift(day, 1)) {
    days.push(day);
  }
  return days;
}

const shifted = new Map<string, LocalDate>();

/** The day `by` days later; remembered, as every pair asks for the same days. */
export function shift(day: LocalDate, by: number): LocalDate {
  const key = `${day}${by}`;
  let result = shifted.get(key);
  if (!result) {
    result = toLocalDate(addDays(parseLocalDate(day), by));
    if (shifted.size > 20_000) {
      shifted.clear();
    }
    shifted.set(key, result);
  }
  return result;
}

export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
