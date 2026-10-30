import {StressLevel, stressLevel} from '@pd/contracts';

/** Helpers of the band's pages: days, clock times, the stress level of a score. */

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Today on this device, `YYYY-MM-DD`. */
export const today = () => new Date().toLocaleDateString('sv');

/** `HH:mm` of a moment, on this device's clock. */
export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('sv', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function minutesBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 60_000);
}

/** The level of a stress score, `null` for none. */
export function levelOf(score: number | null): StressLevel | null {
  return score === null ? null : stressLevel(score);
}

/** The middle half of the values: the owner's usual range ("the corridor"). */
export function corridor(values: number[]): {low: number; high: number} | null {
  if (values.length < 7) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {low: at(0.25), high: at(0.75)};
}
