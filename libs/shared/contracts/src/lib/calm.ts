import { z } from 'zod';

/**
 * A calmer dashboard for hard evenings and nights, set by the user for every device:
 *
 * - quiet hours: notifications (Telegram, push) made in them wait and come at their end as one
 *   message, "during the night: …";
 * - soft overdue: a task past its date is not shown in red and is not named in the morning
 *   digest; it stays in the list as it is.
 */
export interface CalmSettings {
  /** `null` — notifications come at any time. */
  quietHours: { from: string; to: string } | null;
  softOverdue: boolean;
}

/** `HH:MM`, 24 hours. */
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');

export const calmSchema = z.object({
  quietHours: z
    .object({ from: clock, to: clock })
    .refine((hours) => hours.from !== hours.to, {
      message: 'The quiet hours start and end at the same time',
    })
    .nullable(),
  softOverdue: z.boolean(),
});

/** Nothing set yet: as before. */
export const NO_CALM: CalmSettings = { quietHours: null, softOverdue: false };

/** Minutes since midnight of `HH:MM`. */
function minutesOf(clockTime: string): number {
  const [hours, minutes] = clockTime.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * How many minutes of the quiet hours are left at `minuteOfDay` (minutes since the local
 * midnight); `0` — not in them. The hours may cross midnight (21:00–09:00).
 */
export function quietMinutesLeft(hours: CalmSettings['quietHours'], minuteOfDay: number): number {
  if (!hours) {
    return 0;
  }
  const from = minutesOf(hours.from);
  const to = minutesOf(hours.to);
  const inside =
    from < to ? minuteOfDay >= from && minuteOfDay < to : minuteOfDay >= from || minuteOfDay < to;
  if (!inside) {
    return 0;
  }
  return (to - minuteOfDay + 24 * 60) % (24 * 60);
}
