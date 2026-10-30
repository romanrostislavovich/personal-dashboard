import {
  addDays,
  parseLocalDate,
  toLocalDate,
  zonedDateTime,
  zonedToUtc,
} from '@pd/contracts';

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
  return h <= 23 && m <= 59
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    : null;
}

const TIME = String.raw`(?:(?:в|at)\s+)?(\d{1,2})(?:[:.](\d{2}))?`;

/** What every way of saying a time needs: the moment, the user's day and clock. */
interface Context {
  now: Date;
  today: {date: string; time: string};
  /** A day and a time on the user's clock, as a moment. */
  at(date: string, time: string): Date;
  /** The day `days` after today. */
  dayFromToday(days: number): string;
}

/**
 * One way of saying when. `undefined` — the text does not start this way, the next is tried;
 * `null` — it does, but the time is impossible (`25:00`), so the text has no time at all.
 */
type Reader = (
  lower: string,
  context: Context,
) => {at: Date; length: number} | null | undefined;

/** `через 2 часа`, `in 15 min` */
const relative: Reader = (lower, {now}) => {
  const match = /^(?:через|in)\s+(\d{1,4})\s*([a-zа-яё]+)/i.exec(lower);
  if (!match) {
    return undefined;
  }
  const unit = UNITS.find(([pattern]) => pattern.test(match[2]));
  return unit
    ? {
        at: new Date(now.getTime() + Number(match[1]) * unit[1] * MINUTE_MS),
        length: match[0].length,
      }
    : null;
};

const NAMED_DAY = new RegExp(
  String.raw`^(сегодня|today|завтра|tomorrow|послезавтра)(?:\s+${TIME}(?![\d.]))?`,
  'i',
);
const NAMED_DAYS: Record<string, number> = {
  сегодня: 0,
  today: 0,
  завтра: 1,
  tomorrow: 1,
  послезавтра: 2,
};

/** `завтра …`, `tomorrow 18:30 …`, `послезавтра в 9 …`, `сегодня 21:00 …` */
const namedDay: Reader = (lower, {at, dayFromToday}) => {
  const match = NAMED_DAY.exec(lower);
  if (!match) {
    return undefined;
  }
  const time = match[2] ? clock(match[2], match[3]) : DEFAULT_TIME;
  return time
    ? {
        at: at(dayFromToday(NAMED_DAYS[match[1]]), time),
        length: match[0].length,
      }
    : null;
};

const ISO_DATE = new RegExp(
  String.raw`^(\d{4})-(\d{2})-(\d{2})(?:[ t]+${TIME})?`,
  'i',
);
const DOTTED_DATE = new RegExp(
  String.raw`^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?(?:\s+${TIME})?(?![\d.])`,
  'i',
);

/** `2026-10-05 09:00 …`, `05.10 …`, `05.10.2026 9:00 …` */
const date: Reader = (lower, {today, at}) => {
  const iso = ISO_DATE.exec(lower);
  const match = iso ?? DOTTED_DATE.exec(lower);
  if (!match) {
    return undefined;
  }
  const [year, month, day] = iso
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : [
        Number(match[3] ?? today.date.slice(0, 4)),
        Number(match[2]),
        Number(match[1]),
      ];
  const time = match[4] ? clock(match[4], match[5]) : DEFAULT_TIME;
  if (!time || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  let local = toLocalDate({year, month, day});
  // "05.10" said in November means the next 5 October.
  if (!iso && !match[3] && local < today.date) {
    local = toLocalDate({year: year + 1, month, day});
  }
  return {at: at(local, time), length: match[0].length};
};

/** `18:30 …` — today, or tomorrow if that time has passed. */
const timeOnly: Reader = (lower, {today, at, dayFromToday}) => {
  const match = /^(?:(?:в|at)\s+)?(\d{1,2})[:.](\d{2})(?!\d)/i.exec(lower);
  if (!match) {
    return undefined;
  }
  const time = clock(match[1], match[2]);
  return time
    ? {
        at: at(dayFromToday(time > today.time ? 0 : 1), time),
        length: match[0].length,
      }
    : null;
};

/** In the order they are tried: the first that recognises the start of the text decides. */
const READERS: Reader[] = [relative, namedDay, date, timeOnly];

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
export function parseWhen(
  text: string,
  now: Date,
  timeZone: string,
): ParsedWhen | null {
  const input = text.trim();
  const lower = input.toLowerCase();
  const today = zonedDateTime(now, timeZone);
  const context: Context = {
    now,
    today,
    at: (day, time) => zonedToUtc({date: day, time}, timeZone),
    dayFromToday: days =>
      toLocalDate(addDays(parseLocalDate(today.date), days)),
  };
  for (const read of READERS) {
    const found = read(lower, context);
    if (found !== undefined) {
      return found && {at: found.at, rest: input.slice(found.length).trim()};
    }
  }
  return null;
}
