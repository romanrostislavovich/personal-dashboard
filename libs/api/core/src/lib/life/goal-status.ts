import { LifeGoalDirection, LifeGoalStatus, LocalDate } from '@pd/contracts';

/**
 * How a goal of a year is going. A total ("300 diary days") is expected to grow evenly over
 * the year; an average ("mood at least 4") is compared with the target as it is.
 */
export function goalStatus(
  goal: { year: number; target: number; direction: LifeGoalDirection },
  value: number,
  average: boolean,
  today: LocalDate,
): { expected: number; status: LifeGoalStatus } {
  const share = average ? 1 : yearShare(goal.year, today);
  const expected = round(goal.target * share);
  const over = today > `${goal.year}-12-31`;
  let status: LifeGoalStatus;
  if (goal.direction === 'atLeast') {
    // An average is only settled when the year is over.
    status =
      value >= goal.target && (!average || over)
        ? 'done'
        : over
          ? 'failed'
          : value >= expected
            ? 'onTrack'
            : 'behind';
  } else {
    status = over
      ? value <= goal.target
        ? 'done'
        : 'failed'
      : !average && value > goal.target
        ? 'failed'
        : value <= expected
          ? 'onTrack'
          : 'behind';
  }
  return { expected, status };
}

/** How much of the year has passed by the end of today: 0 before it, 1 after it. */
export function yearShare(year: number, today: LocalDate): number {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const now = Date.parse(today) + 86_400_000;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
