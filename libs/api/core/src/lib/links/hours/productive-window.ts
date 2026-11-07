import {HourlyMetric, LocalDate, ProductiveWindow} from '@pd/contracts';
import {mean, round, weekdayOf} from './local-hours';
import {rhythmOf} from './rhythm';

/*
 * The productive window (the owner's idea): the hours of each weekday when coding, deep work and
 * tasks done are highest for this user. Each number is taken against its own usual hour, so the
 * minutes of coding do not outweigh the few tasks done; the window is where they are high
 * together.
 */

/** A window's hours are at or above this share of the weekday's best hour … */
const WINDOW_SHARE = 0.6;
/** … and this many times its average hour. */
const ABOVE_AVERAGE = 1.5;
const WINDOWS = 2;
/** Fewer weekdays seen than this — not sure. */
const FEW_DAYS = 4;
const MANY_DAYS = 8;
/** How many times the window's hours beat the day's average hour, to be sure of it. */
const CLEAR = 3;
const NOTICEABLE = 2;

/** The window of every weekday, Monday first, from the `productive` numbers. */
export function productiveWindows(metrics: HourlyMetric[]): ProductiveWindow[] {
  const productive = metrics.filter(metric => metric.productive);
  const rhythms = productive.map(rhythmOf);
  // Each number against its usual hour of every day seen.
  const usual = rhythms.map(rhythm =>
    mean(rhythm.profile.filter((value): value is number => value !== null)),
  );
  const seen = new Set<LocalDate>(productive.flatMap(metric => metric.days));
  return [...Array(7).keys()].map(weekday => {
    const days = [...seen].filter(day => weekdayOf(day) === weekday).length;
    const scores = [...Array(24).keys()].map(hour => {
      const parts = rhythms.flatMap((rhythm, index) => {
        const value = rhythm.cells[weekday][hour];
        return value === null || !usual[index] ? [] : [value / usual[index]];
      });
      return parts.length ? mean(parts) : 0;
    });
    const windows = windowsOf(scores);
    const average = mean(scores);
    const inside = mean(
      windows.flatMap(({from, to}) => scores.slice(from, to)),
    );
    const contrast = average ? inside / average : 0;
    return {
      weekday,
      windows,
      days,
      sure:
        !windows.length || days < FEW_DAYS || contrast < NOTICEABLE
          ? 'low'
          : days >= MANY_DAYS && contrast >= CLEAR
            ? 'high'
            : 'medium',
    };
  });
}

/** The runs of the day's best hours, the two largest, in the order of the day. */
function windowsOf(scores: number[]): {from: number; to: number}[] {
  const best = Math.max(...scores);
  if (best <= 0) {
    return [];
  }
  const threshold = Math.max(best * WINDOW_SHARE, mean(scores) * ABOVE_AVERAGE);
  const runs: {from: number; to: number; sum: number}[] = [];
  scores.forEach((score, hour) => {
    if (score < threshold) {
      return;
    }
    const last = runs[runs.length - 1];
    if (last && last.to === hour) {
      last.to = hour + 1;
      last.sum += score;
    } else {
      runs.push({from: hour, to: hour + 1, sum: score});
    }
  });
  return runs
    .sort((a, b) => b.sum - a.sum)
    .slice(0, WINDOWS)
    .sort((a, b) => a.from - b.from)
    .map(({from, to}) => ({from, to}));
}

/**
 * Whether a day's deep work went mostly into its weekday's window: at least `share` of its
 * minutes (the "in my window" achievement).
 */
export function inWindow(
  hourly: (number | undefined)[],
  window: ProductiveWindow,
  share = 0.5,
): boolean {
  const total = hourly.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  if (!total || !window.windows.length) {
    return false;
  }
  const inside = window.windows.reduce(
    (sum, {from, to}) =>
      sum +
      hourly
        .slice(from, to)
        .reduce<number>((part, value) => part + (value ?? 0), 0),
    0,
  );
  return round(inside / total, 4) >= share;
}
