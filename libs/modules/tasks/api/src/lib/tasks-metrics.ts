import {addDays, LocalDate, parseLocalDate, toLocalDate} from '@pd/contracts';

/** A task as the daily numbers see it: its days in the user's calendar. */
export interface TaskDays {
  created: LocalDate;
  done: LocalDate | null;
  due: LocalDate | null;
  priority: number;
}

type Days = {day: LocalDate; value: number}[];

export interface TaskDayNumbers {
  /** Open at the end of the day and either without a date or past it ("open loops"). */
  openLoops: Days;
  /** Of them, past their date. */
  overdue: Days;
  /** Of the tasks due that day, the share done by its end, % (only days something was due). */
  dueDone: Days;
  /** Tasks of the highest priority done that day. */
  importantDone: Days;
}

const HIGHEST = 3;

/**
 * The tasks' daily numbers, counted back from the tasks as they are now: a date changed later
 * counts as if it had always been the new one (the history of dates is not kept).
 */
export function taskDayNumbers(
  tasks: TaskDays[],
  period: {from: LocalDate; to: LocalDate},
): TaskDayNumbers {
  const numbers: TaskDayNumbers = {
    openLoops: [],
    overdue: [],
    dueDone: [],
    importantDone: [],
  };
  const first = tasks.reduce<LocalDate | null>(
    (earliest, task) =>
      earliest === null || task.created < earliest ? task.created : earliest,
    null,
  );
  if (!first) {
    return numbers;
  }
  const start = first > period.from ? first : period.from;
  for (let day = start; day <= period.to; day = next(day)) {
    let loops = 0;
    let overdue = 0;
    let due = 0;
    let dueDone = 0;
    let important = 0;
    for (const task of tasks) {
      const openAtEnd = task.created <= day && (!task.done || task.done > day);
      if (openAtEnd && (!task.due || task.due < day)) {
        loops++;
        if (task.due) {
          overdue++;
        }
      }
      if (task.due === day && task.created <= day) {
        due++;
        if (task.done && task.done <= day) {
          dueDone++;
        }
      }
      if (task.done === day && task.priority >= HIGHEST) {
        important++;
      }
    }
    numbers.openLoops.push({day, value: loops});
    numbers.overdue.push({day, value: overdue});
    numbers.importantDone.push({day, value: important});
    if (due) {
      numbers.dueDone.push({day, value: Math.round((dueDone / due) * 100)});
    }
  }
  return numbers;
}

function next(day: LocalDate): LocalDate {
  return toLocalDate(addDays(parseLocalDate(day), 1));
}
