import { LocalDate } from '@pd/contracts';

const DAYS_IN_MONTH = 30.44;

/**
 * How a goal is going: how much to put aside a month to make it by the deadline, and how much
 * was saved a month on average so far. Counted in days, so a goal started this week does not
 * show a whole month's pace.
 */
export function goalPace(
  goal: { target: number; startedOn: LocalDate; deadline: LocalDate | null },
  saved: number,
  today: LocalDate,
): { neededPerMonth: number | null; pacePerMonth: number } {
  const monthsSinceStart = Math.max(1, daysBetween(goal.startedOn, today) / DAYS_IN_MONTH);
  const pacePerMonth = round(Math.max(0, saved) / monthsSinceStart);
  if (!goal.deadline || saved >= goal.target) {
    return { neededPerMonth: null, pacePerMonth };
  }
  const monthsLeft = Math.max(1, daysBetween(today, goal.deadline) / DAYS_IN_MONTH);
  return { neededPerMonth: round((goal.target - saved) / monthsLeft), pacePerMonth };
}

function daysBetween(from: LocalDate, to: LocalDate): number {
  return (Date.parse(to) - Date.parse(from)) / 86_400_000;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
