import { addDays, LocalDate, parseLocalDate, PsychologyPatterns, toLocalDate } from '@pd/contracts';

/** On the diary's scale of 1–5: a low mood. */
const LOW_UP_TO = 2;

const round = (value: number) => Math.round(value * 100) / 100;
const average = (values: number[]) =>
  values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
const shift = (day: LocalDate, days: number) => toLocalDate(addDays(parseLocalDate(day), days));
/** Monday is 0. */
const weekdayOf = (day: LocalDate) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
const mondayOf = (day: LocalDate) => shift(day, -weekdayOf(day));

/**
 * The mood over time: by the day of the week, week by week, the longest run of low days and
 * the mood during the events of a life. `mood` — a day and its mood on the scale of 1–5.
 */
export function moodPatterns(
  mood: { day: LocalDate; value: number }[],
  events: { id: string; title: string; startedOn: LocalDate; endedOn: LocalDate | null }[],
  period: { from: LocalDate; to: LocalDate },
): PsychologyPatterns {
  const days = [...mood].sort((a, b) => a.day.localeCompare(b.day));

  const byWeekday = Array.from({ length: 7 }, (_, weekday) => {
    const values = days.filter((item) => weekdayOf(item.day) === weekday).map((item) => item.value);
    return { weekday, average: average(values), days: values.length };
  });

  const perWeek = new Map<LocalDate, number[]>();
  for (const { day, value } of days) {
    const week = mondayOf(day);
    perWeek.set(week, [...(perWeek.get(week) ?? []), value]);
  }
  const weeks = [...perWeek].map(([week, values]) => ({
    week,
    average: average(values) ?? 0,
    days: values.length,
  }));

  // A run is days next to each other in the calendar: a day without a mood breaks it.
  let longestLowRun: PsychologyPatterns['longestLowRun'] = null;
  let runDays = 0;
  let runFrom: LocalDate | null = null;
  let runLast: LocalDate | null = null;
  for (const { day, value } of days) {
    if (value > LOW_UP_TO) {
      runDays = 0;
      runLast = null;
      continue;
    }
    if (runLast && shift(runLast, 1) === day) {
      runDays += 1;
    } else {
      runDays = 1;
      runFrom = day;
    }
    runLast = day;
    if (runFrom && (!longestLowRun || runDays > longestLowRun.days)) {
      longestLowRun = { days: runDays, from: runFrom };
    }
  }

  return {
    ...period,
    days: days.length,
    average: average(days.map((item) => item.value)),
    byWeekday,
    weeks,
    longestLowRun,
    events: events
      .map((event) => {
        const to = event.endedOn ?? event.startedOn;
        return {
          id: event.id,
          title: event.title,
          from: event.startedOn,
          to,
          mood: average(
            days
              .filter((item) => item.day >= event.startedOn && item.day <= to)
              .map((item) => item.value),
          ),
        };
      })
      .filter((event) => event.to >= period.from && event.from <= period.to)
      .sort((a, b) => b.from.localeCompare(a.from)),
  };
}
