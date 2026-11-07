import {HourlyInfo} from '@pd/contracts';

/* How the hours of Links read: "10–12", "35 min", the weekdays by name. */

/** `[from, to)` hours as "10–12" (to 24 is midnight). */
export function hourRange({from, to}: {from: number; to: number}): string {
  return `${from}–${to}`;
}

/** Several ranges as "10–12, 21–23". */
export function hourRanges(ranges: {from: number; to: number}[]): string {
  return ranges.map(hourRange).join(', ');
}

/** A value of an hourly number in its unit; `minutes` names the unit of minutes. */
export function hourlyValue(
  metric: Pick<HourlyInfo, 'unit'>,
  value: number,
  locale: string,
  minutes: (value: string) => string,
): string {
  const number = (digits: number) =>
    value.toLocaleString(locale, {maximumFractionDigits: digits});
  return metric.unit === 'minutes' ? minutes(number(0)) : number(1);
}

/** The weekdays' short names, Monday first, in the locale. */
export function weekdayNames(locale: string): string[] {
  // 2026-11-02 is a Monday.
  return [...Array(7).keys()].map(day =>
    new Date(Date.UTC(2026, 10, 2 + day)).toLocaleDateString(locale, {
      weekday: 'short',
      timeZone: 'UTC',
    }),
  );
}
