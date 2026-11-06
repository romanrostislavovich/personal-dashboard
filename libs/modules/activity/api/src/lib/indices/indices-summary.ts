import {
  ActivityIndex,
  addDays,
  LocalDate,
  parseLocalDate,
  toLocalDate,
} from '@pd/contracts';

/** The indices the card, the widget and the summary show, in this order, with their units. */
export const SHOWN_INDICES: {key: string; unit: ActivityIndex['unit']}[] = [
  {key: 'deepWork', unit: 'hours'},
  {key: 'nourishing', unit: 'hours'},
  {key: 'draining', unit: 'hours'},
  {key: 'phone.restlessness', unit: 'score'},
  {key: 'focusInterruptions', unit: 'score'},
  {key: 'lateNight', unit: 'hours'},
  {key: 'afterBedtime', unit: 'count'},
  {key: 'offline', unit: 'hours'},
  {key: 'firstWork', unit: 'count'},
  {key: 'morningDraining', unit: 'count'},
  {key: 'computer.restlessness', unit: 'score'},
  {key: 'phone.shortSessions', unit: 'percent'},
  {key: 'phone.appSwitches', unit: 'score'},
  {key: 'deepWorkLongest', unit: 'count'},
  {key: 'phone.bedtimeSpread', unit: 'score'},
];

const WEEK = 7;
const NORM = 28;

/** The days the summary reads back from `today`: a week and the four weeks before it. */
export function summaryPeriod(today: LocalDate): {
  from: LocalDate;
  to: LocalDate;
} {
  return {from: shift(today, -(WEEK + NORM) + 1), to: today};
}

/** Today, the week's average and the owner's norm (the median before the week) of each index. */
export function indexSummary(
  kept: Map<string, {day: LocalDate; value: number}[]>,
  today: LocalDate,
): ActivityIndex[] {
  const weekFrom = shift(today, -WEEK + 1);
  return SHOWN_INDICES.flatMap(({key, unit}): ActivityIndex[] => {
    const days = kept.get(key) ?? [];
    if (!days.length) {
      return [];
    }
    const week = days.filter(one => one.day >= weekFrom).map(one => one.value);
    const before = days.filter(one => one.day < weekFrom).map(one => one.value);
    return [
      {
        key,
        unit,
        today: days.find(one => one.day === today)?.value ?? null,
        week: week.length ? round(average(week)) : null,
        norm: before.length >= WEEK ? round(median(before)) : null,
      },
    ];
  });
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function shift(day: LocalDate, by: number): LocalDate {
  return toLocalDate(addDays(parseLocalDate(day), by));
}
