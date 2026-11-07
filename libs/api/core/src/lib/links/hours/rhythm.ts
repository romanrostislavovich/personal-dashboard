import {HourlyMetric, HourRhythm} from '@pd/contracts';
import {hourOf, mean, readerOf, round, weekdayOf} from './local-hours';

/*
 * The day's rhythm: a number by weekday and hour over the days it was seen ("your coding peaks
 * 10–12 and 21–23"), and its usual day.
 */

/** A peak: the hours at or above this share of the day's best hour. */
const PEAK_SHARE = 0.75;
const PEAKS = 2;

export function rhythmOf(metric: HourlyMetric): HourRhythm {
  const read = readerOf(metric);
  const cells = [...Array(7)].map(() =>
    [...Array(24)].map(() => [] as number[]),
  );
  const byHour = [...Array(24)].map(() => [] as number[]);
  for (const day of metric.days) {
    const weekday = weekdayOf(day);
    for (let hour = 0; hour < 24; hour++) {
      const value = read(hourOf(day, hour));
      if (value !== undefined) {
        cells[weekday][hour].push(value);
        byHour[hour].push(value);
      }
    }
  }
  const meanOrNull = (values: number[]) =>
    values.length ? round(mean(values)) : null;
  const profile = byHour.map(meanOrNull);
  return {
    key: metric.key,
    days: metric.days.length,
    cells: cells.map(row => row.map(meanOrNull)),
    profile,
    peaks: peaksOf(profile),
  };
}

/**
 * The runs of hours at or above PEAK_SHARE of the best hour, the largest first; a score's peaks
 * are where it is highest too. A day flat at zero has none.
 */
export function peaksOf(
  profile: (number | null)[],
): {from: number; to: number}[] {
  const known = profile.filter((value): value is number => value !== null);
  const best = Math.max(0, ...known);
  if (best <= 0) {
    return [];
  }
  const runs: {from: number; to: number; sum: number}[] = [];
  profile.forEach((value, hour) => {
    if (value === null || value < best * PEAK_SHARE) {
      return;
    }
    const last = runs[runs.length - 1];
    if (last && last.to === hour) {
      last.to = hour + 1;
      last.sum += value;
    } else {
      runs.push({from: hour, to: hour + 1, sum: value});
    }
  });
  return runs
    .sort((a, b) => b.sum - a.sum)
    .slice(0, PEAKS)
    .map(({from, to}) => ({from, to}));
}
