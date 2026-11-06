/**
 * One group of days of a dose–response chart: the days `a` was between `from` and `to`, and the
 * average `b` of them.
 */
export interface DoseGroup {
  from: number;
  to: number;
  /** The average of `b` on these days. */
  mean: number;
  /** Days in the group. */
  n: number;
}

/** How many groups a chart has at most: few enough that each has days to average. */
export const DOSE_GROUPS = 5;
/** A group needs this many days, or its average is a guess. */
const MIN_GROUP_DAYS = 3;

/**
 * Dose–response, "not only straight lines": the days split into groups by `x` (as equal in size
 * as ties allow; a number of a few values gets a group a value), with `y`'s average in each — so
 * "up to about 40 minutes of walking the mood rises, then stays" can be seen. Days of the same
 * `x` stay together. Empty when there are fewer than two groups of enough days.
 */
export function doseGroups(
  x: number[],
  y: number[],
  groups = DOSE_GROUPS,
): DoseGroup[] {
  const days = x
    .map((value, index) => ({x: value, y: y[index]}))
    .filter(day => Number.isFinite(day.x) && Number.isFinite(day.y))
    .sort((a, b) => a.x - b.x);
  const wanted = Math.min(groups, Math.floor(days.length / MIN_GROUP_DAYS));
  const result: DoseGroup[] = [];
  let start = 0;
  for (let group = 0; group < wanted && start < days.length; group++) {
    let end = Math.max(
      Math.round(((group + 1) * days.length) / wanted),
      start + 1,
    );
    // Ties stay in one group: the last value's days all go here.
    while (end < days.length && days[end].x === days[end - 1].x) {
      end++;
    }
    const part = days.slice(start, end);
    start += part.length;
    result.push({
      from: part[0].x,
      to: part[part.length - 1].x,
      mean: part.reduce((sum, day) => sum + day.y, 0) / part.length,
      n: part.length,
    });
  }
  // A short last group (ties pulled its days into the one before) joins that one.
  const last = result[result.length - 1];
  if (result.length > 1 && last.n < MIN_GROUP_DAYS) {
    const before = result[result.length - 2];
    const n = before.n + last.n;
    result.splice(-2, 2, {
      from: before.from,
      to: last.to,
      mean: (before.mean * before.n + last.mean * last.n) / n,
      n,
    });
  }
  return result.length >= 2 ? result : [];
}
