import {HourlyMetric, LocalDate, LocalHour} from '@pd/contracts';
import {shift} from '../daily-series';

/* The user's own hours (`2026-11-07T14`) and an hourly number read hour by hour. */

export function hourOf(day: LocalDate, hour: number): LocalHour {
  return `${day}T${String(hour).padStart(2, '0')}`;
}

export function splitHour(hour: LocalHour): {day: LocalDate; hour: number} {
  return {day: hour.slice(0, 10), hour: Number(hour.slice(11, 13))};
}

/** 0 — Monday … 6 — Sunday. */
export function weekdayOf(day: LocalDate): number {
  return (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
}

/** The hour after (23:00 → 00:00 of the next day). */
export function nextHour(hour: LocalHour): LocalHour {
  const {day, hour: at} = splitHour(hour);
  return at === 23 ? hourOf(shift(day, 1), 0) : hourOf(day, at + 1);
}

export function previousHour(hour: LocalHour): LocalHour {
  const {day, hour: at} = splitHour(hour);
  return at === 0 ? hourOf(shift(day, -1), 23) : hourOf(day, at - 1);
}

/**
 * An hourly number as a reader of one hour: a minute or a count is a zero on the days it was
 * seen, a score (a reading) is known only where it was taken; outside its days — unknown.
 */
export function readerOf(
  metric: HourlyMetric,
): (hour: LocalHour) => number | undefined {
  const values = new Map(metric.hours.map(one => [one.hour, one.value]));
  const days = new Set(metric.days);
  return hour => {
    const value = values.get(hour);
    if (value !== undefined) {
      return value;
    }
    return metric.unit !== 'score' && days.has(hour.slice(0, 10))
      ? 0
      : undefined;
  };
}

export function mean(values: number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

export function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
