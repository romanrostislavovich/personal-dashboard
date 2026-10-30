import {
  addDays,
  parseLocalDate,
  toLocalDate,
  zonedDateTime,
} from '@pd/contracts';

/**
 * The title of a question held through the quiet hours, when it goes out on another day: the day
 * it is about comes first ("Yesterday, 26.10 — 🌙 A day without alcohol?"), or the answer would
 * read as about today. The answer itself already goes to the right day (the buttons carry it).
 */
export function heldTitle(
  title: string,
  createdAt: Date,
  now: Date,
  timeZone: string,
  words: {
    yesterday: (date: string) => string;
    earlier: (date: string) => string;
  },
): string {
  const asked = zonedDateTime(createdAt, timeZone).date;
  const today = zonedDateTime(now, timeZone).date;
  if (asked === today) {
    return title;
  }
  const [, month, day] = asked.split('-');
  const date = `${day}.${month}`;
  const yesterday = toLocalDate(addDays(parseLocalDate(today), -1));
  return `${asked === yesterday ? words.yesterday(date) : words.earlier(date)} — ${title}`;
}
