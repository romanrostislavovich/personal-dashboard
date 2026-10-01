import { addDays, parseLocalDate, toLocalDate, zonedDateTime, zonedToUtc } from '@pd/contracts';

/** The time of a reminder when only the day was said: "tomorrow". */
export const DEFAULT_TIME = '09:00';

export interface ParsedWhen {
  at: Date;
  /** The text after the time: what to remind about. */
  rest: string;
}

const MINUTE_MS = 60_000;

/** "через 2 часа", "in 15 min": the unit by its first letters, in minutes. */
const UNITS: [RegExp, number][] = [
  [/^(мин|м\b|min|m\b)/, 1],
  [/^(ч|h)/, 60],
  [/^(д|d)/, 24 * 60],
  [/^(нед|w)/, 7 * 24 * 60],
];

/** `9`, `9:30`, `18.30` → `09:00`, `09:30`, `18:30`; `null` — not a time of day. */
function clock(hours: string, minutes: string | undefined): string | null {
  const h = Number(hours);
  const m = Number(minutes ?? 0);
  return h <= 23 && m <= 59 ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : null;
}

const TIME = String.raw`(?:(?:в|at)\s+)?(\d{1,2})(?:[:.](\d{2}))?`;

/**
 * Reads when to remind from the beginning of a text, in Russian or English, on the user's own
 * clock (`timeZone`):
 *
 * - `через 2 часа …`, `in 15 min …`
 * - `завтра …`, `tomorrow 18:30 …`, `послезавтра в 9 …`, `сегодня 21:00 …`
 * - `05.10 …`, `05.10.2026 9:00 …`, `2026-10-05 09:00 …`
 * - `18:30 …` — today, or tomorrow if that time has passed
 *
 * A day without a time means 09:00. `null` — the text does not start with a time.
 */
export function parseWhen(text: string, now: Date, timeZone: string): ParsedWhen | null {
  const input = text.trim();
  const lower = input.toLowerCase();
  const rest = (matched: string) => input.slice(matched.length).trim();
  const today = zonedDateTime(now, timeZone);
  const at = (date: string, time: string) => zonedToUtc({ date, time }, timeZone);
  const dayFromToday = (days: number) => toLocalDate(addDays(parseLocalDate(today.date), days));

  const relative = /^(?:через|in)\s+(\d{1,4})\s*([a-zа-яё]+)/i.exec(lower);
  if (relative) {
    const unit = UNITS.find(([pattern]) => pattern.test(relative[2]));
    return unit
      ? {
          at: new Date(now.getTime() + Number(relative[1]) * unit[1] * MINUTE_MS),
          rest: rest(relative[0]),
        }
      : null;
  }

  const named = new RegExp(
    String.raw`^(сегодня|today|завтра|tomorrow|послезавтра)(?:\s+${TIME}(?![\d.]))?`,
    'i',
  ).exec(lower);
  if (named) {
    const days = /^(сегодня|today)$/.test(named[1]) ? 0 : named[1] === 'послезавтра' ? 2 : 1;
    const time = named[2] ? clock(named[2], named[3]) : DEFAULT_TIME;
    return time ? { at: at(dayFromToday(days), time), rest: rest(named[0]) } : null;
  }

  const dated =
    new RegExp(String.raw`^(\d{4})-(\d{2})-(\d{2})(?:[ t]+${TIME})?`, 'i').exec(lower) ??
    new RegExp(String.raw`^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?(?:\s+${TIME})?(?![\d.])`, 'i').exec(
      lower,
    );
  if (dated) {
    const iso = dated[1].length === 4;
    const [year, month, day] = iso
      ? [Number(dated[1]), Number(dated[2]), Number(dated[3])]
      : [Number(dated[3] ?? today.date.slice(0, 4)), Number(dated[2]), Number(dated[1])];
    const time = dated[4] ? clock(dated[4], dated[5]) : DEFAULT_TIME;
    if (!time || month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }
    let date = toLocalDate({ year, month, day });
    // "05.10" said in November means the next 5 October.
    if (!iso && !dated[3] && date < today.date) {
      date = toLocalDate({ year: year + 1, month, day });
    }
    return { at: at(date, time), rest: rest(dated[0]) };
  }

  const timeOnly = /^(?:(?:в|at)\s+)?(\d{1,2})[:.](\d{2})(?!\d)/i.exec(lower);
  if (timeOnly) {
    const time = clock(timeOnly[1], timeOnly[2]);
    if (!time) {
      return null;
    }
    // A time that has passed today means tomorrow.
    return { at: at(dayFromToday(time > today.time ? 0 : 1), time), rest: rest(timeOnly[0]) };
  }
  return null;
}
