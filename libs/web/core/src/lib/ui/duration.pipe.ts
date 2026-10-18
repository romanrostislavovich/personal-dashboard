import { inject, Pipe, PipeTransform } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

/** Seconds as whole hours and minutes. */
function durationParts(seconds: number): { hours: number; minutes: number } {
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
    // Whole hours read "10 h", not "10 h 0 min" (the marks of a chart's scale are such).
    const key =
      hours === 0
        ? 'core.duration.minutes'
        : minutes
          ? 'core.duration.hoursMinutes'
          : 'core.duration.hours';
    return this.transloco.translate(key, { hours, minutes });
  }
}
