import { LocalDate } from '@pd/contracts';

// The browser is on the user's own clock, so local dates and times are simply the device's.

/** Today on this device: `YYYY-MM-DD`. */
export function todayLocal(now: Date = new Date()): LocalDate {
  return localInputValue(now).slice(0, 10);
}

/** A moment as `<input type="datetime-local">` wants it: `YYYY-MM-DDTHH:mm` in local time. */
export function localInputValue(at: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `T${pad(at.getHours())}:${pad(at.getMinutes())}`
  );
}

/** The value of a `datetime-local` input → the moment (ISO); `null` for an empty or broken one. */
export function momentOf(inputValue: string): string | null {
  const at = new Date(inputValue);
  return inputValue && !Number.isNaN(at.getTime()) ? at.toISOString() : null;
}

/** A sensible default for "remind me": the next full hour. */
export function nextHour(now: Date = new Date()): string {
  const at = new Date(now);
  at.setHours(at.getHours() + 1, 0, 0, 0);
  return localInputValue(at);
}
