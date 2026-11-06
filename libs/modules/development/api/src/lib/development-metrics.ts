import {DailyMetric, LocalDate} from '@pd/contracts';

/** A project or a language must have been coded in on this many days to be a number. */
const MIN_DAYS = 10;
/** The ones of the most days only: every number more makes the search stricter for all. */
const MAX_NAMES = 5;

/**
 * WakaTime's split of a day (by project or by language) as daily numbers: the five of the most
 * days, each a part of the coding time; a day of coding without it is a zero.
 */
export function breakdownMetrics(
  rows: {day: LocalDate; name: string; seconds: number}[],
  codingDays: LocalDate[],
  kind: 'project' | 'language',
): DailyMetric[] {
  // By a key safe for a list in a query (no commas or spaces); names that differ only in case
  // or spacing are one project.
  const byName = new Map<string, Map<LocalDate, number>>();
  const names = new Map<string, string>();
  for (const {day, name, seconds} of rows) {
    const slug = slugOf(name);
    if (seconds > 0 && slug) {
      names.set(slug, names.get(slug) ?? name);
      const days = byName.get(slug) ?? new Map<LocalDate, number>();
      byName.set(slug, days.set(day, (days.get(day) ?? 0) + seconds));
    }
  }
  const days = [...new Set(codingDays)].sort();
  return [...byName]
    .filter(([, on]) => on.size >= MIN_DAYS)
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .slice(0, MAX_NAMES)
    .map(([slug, on]) => ({
      key: `development.${kind}.${slug}`,
      module: 'development',
      labelKey: `development.links.${kind}`,
      label: names.get(slug) ?? slug,
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

function slugOf(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s,]+/g, '-');
}
