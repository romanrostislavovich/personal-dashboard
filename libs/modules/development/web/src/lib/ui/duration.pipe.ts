import { inject, Pipe, PipeTransform } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

/** Seconds as whole hours and minutes. */
export function durationParts(seconds: number): { hours: number; minutes: number } {
  const totalMinutes = Math.round(seconds / 60);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

/**
 * Seconds as "3 h 20 min" in the user's language: `{{ seconds | pdDuration }}`.
 * Impure so the text follows a language switch.
 */
@Pipe({ name: 'pdDuration', pure: false })
export class DurationPipe implements PipeTransform {
  private readonly transloco = inject(TranslocoService);

  transform(seconds: number | null | undefined): string {
    const { hours, minutes } = durationParts(seconds ?? 0);
    return this.transloco.translate(
      hours > 0 ? 'development.duration.hoursMinutes' : 'development.duration.minutes',
      { hours, minutes },
    );
  }
}
