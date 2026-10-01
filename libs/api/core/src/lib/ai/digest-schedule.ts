import { LocalDate } from '@pd/contracts';

export interface DigestSchedule {
  /** When the user wants the digest, `HH:mm`. */
  time: string;
  /** The last day the digest was handled (sent, or found to have nothing new). */
  lastDay: LocalDate | null;
}

/**
 * Whether it is time for a user's digest: their hour has come and today's digest was not handled
 * yet. The job checks every few minutes, so a server that was off at the chosen time still sends
 * the digest when it is back — once.
 */
export function isDigestDue(schedule: DigestSchedule, today: LocalDate, now: string): boolean {
  return schedule.lastDay !== today && now >= schedule.time;
}

/** `HH:mm` on the clock of the given time zone. */
export function clockIn(timeZone: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('hour')}:${get('minute')}`;
}
