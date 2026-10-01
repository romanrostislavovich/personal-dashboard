import { LocalDate } from './local-date';

/** A moment as a wall clock shows it somewhere: the day and `HH:mm`. */
export interface LocalDateTime {
  date: LocalDate;
  time: string;
}

/** Whether the runtime knows the IANA time zone (`Europe/Warsaw`). */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The time zone of the device the code runs on: the user's own, in a browser or an app. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** What the clock shows in the time zone at the given moment. */
export function zonedDateTime(at: Date, timeZone: string): LocalDateTime {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

/**
 * The moment at which the clock in the time zone shows the given day and time. An hour skipped
 * by a switch to summer time lands on the hour after it.
 */
export function zonedToUtc({ date, time }: LocalDateTime, timeZone: string): Date {
  const asUtc = Date.parse(`${date}T${time}:00Z`);
  // The zone's offset depends on the moment, the moment on the offset: two steps settle it.
  const first = asUtc - offsetMs(asUtc, timeZone);
  return new Date(asUtc - offsetMs(first, timeZone));
}

/** How far the zone's clock is ahead of UTC at the moment, in milliseconds. */
function offsetMs(at: number, timeZone: string): number {
  const { date, time } = zonedDateTime(new Date(at), timeZone);
  // Whole minutes: seconds of the moment are dropped the same way on both sides.
  return Date.parse(`${date}T${time}:00Z`) - Math.floor(at / 60_000) * 60_000;
}
