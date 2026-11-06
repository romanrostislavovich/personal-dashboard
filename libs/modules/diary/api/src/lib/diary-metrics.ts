import {addDays, LocalDate, parseLocalDate, toLocalDate} from '@pd/contracts';

/** The tags a day of the diary must have been used on to be a number of Links. */
const TAG_MIN_DAYS = 5;
/** The most used tags only: every number more makes the search stricter for all. */
const MAX_TAGS = 10;
/** The mood's spread needs this many days with a mood within its window. */
const SPREAD_MIN_DAYS = 5;

export function shift(day: LocalDate, by: number): LocalDate {
  return toLocalDate(addDays(parseLocalDate(day), by));
}

/**
 * The most used tags (#sport, #friends) as yes/no days: 1 on a day whose entry has the tag, 0 on
 * a day with an entry without it; a day without an entry is left out (it says nothing).
 */
export function tagDays(
  entries: {day: LocalDate; tags: string[]}[],
): {tag: string; days: {day: LocalDate; value: number}[]}[] {
  const used = new Map<string, Set<LocalDate>>();
  for (const {day, tags} of entries) {
    for (const tag of new Set(tags.map(one => one.toLowerCase()))) {
      used.set(tag, (used.get(tag) ?? new Set()).add(day));
    }
  }
  const days = [...new Set(entries.map(entry => entry.day))].sort();
  return [...used]
    .filter(([, on]) => on.size >= TAG_MIN_DAYS && on.size < days.length)
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .slice(0, MAX_TAGS)
    .map(([tag, on]) => ({
      tag,
      days: days.map(day => ({day, value: on.has(day) ? 1 : 0})),
    }));
}

/**
 * How much the mood swung over the `window` days up to each day: the standard deviation of the
 * moods given in it; a day with fewer than SPREAD_MIN_DAYS of them has none.
 */
export function moodVolatility(
  entries: {day: LocalDate; mood: number | null}[],
  window: number,
): {day: LocalDate; value: number}[] {
  const moods = new Map(
    entries.flatMap(({day, mood}) => (mood === null ? [] : [[day, mood]])),
  );
  const result: {day: LocalDate; value: number}[] = [];
  for (const day of [...moods.keys()].sort()) {
    const values: number[] = [];
    for (let back = 0; back < window; back++) {
      const value = moods.get(shift(day, -back));
      if (value !== undefined) {
        values.push(value);
      }
    }
    if (values.length >= SPREAD_MIN_DAYS) {
      const mean =
        values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance =
        values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        values.length;
      result.push({day, value: Math.round(Math.sqrt(variance) * 100) / 100});
    }
  }
  return result;
}
