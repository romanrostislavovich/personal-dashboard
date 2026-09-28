import { Pipe, PipeTransform } from '@angular/core';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "3 hours ago", like match lists on Dotabuff: `{{ startedAt | timeAgo: lang }}`. */
@Pipe({ name: 'timeAgo' })
export class TimeAgoPipe implements PipeTransform {
  transform(value: string | null | undefined, lang: string): string {
    if (!value) {
      return '—';
    }
    const seconds = (new Date(value).getTime() - Date.now()) / 1000;
    const format = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    for (const [unit, size] of UNITS) {
      if (Math.abs(seconds) >= size) {
        return format.format(Math.round(seconds / size), unit);
      }
    }
    return format.format(0, 'minute');
  }
}
