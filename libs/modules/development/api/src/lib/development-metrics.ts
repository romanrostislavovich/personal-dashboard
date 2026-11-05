import {DailyMetric, LocalDate} from '@pd/contracts';

/** A project or a language must have been coded in on this many days to be a number. */
const MIN_DAYS = 10;
/** The ones of the most days only: every number more makes the search stricter for all. */
const MAX_NAMES = 5;

/**
 * WakaTime's split of a day (by project or by language) as daily numbers: the five of the most
 * days, each a part of the coding time; a day of coding without it is a zero, a day without
 * coding is left out (the coding number has it).
 */
export function breakdownMetrics(
  rows: {day: LocalDate; name: string; seconds: number}[],
  codingDays: LocalDate[],
  kind: 'project' | 'language',
): DailyMetric[] {
  const byName = new Map<string, Map<LocalDate, number>>();
  for (const {day, name, seconds} of rows) {
    if (seconds > 0) {
      const days = byName.get(name) ?? new Map<LocalDate, number>();
      byName.set(name, days.set(day, (days.get(day) ?? 0) + seconds));
    }
  }
  const days = [...new Set(codingDays)].sort();
  return [...byName]
    .filter(([, on]) => on.size >= MIN_DAYS)
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .slice(0, MAX_NAMES)
    .map(([name, on]) => ({
      key: `development.${kind}.${name.toLowerCase()}`,
      module: 'development',
      labelKey: `development.links.${kind}`,
      label: name,
      unit: 'hours',
      partOf: 'development.coding',
      // The languages are many and say little apart from the projects.
      ...(kind === 'language' ? {extra: true as const} : {}),
      days: days.map(day => ({
        day,
        value: Math.round(((on.get(day) ?? 0) / 3600) * 100) / 100,
      })),
    }));
}
