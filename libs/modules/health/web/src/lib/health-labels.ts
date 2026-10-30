import {inject, Pipe, PipeTransform} from '@angular/core';
import {TranslocoService} from '@jsverse/transloco';
import {HEALTH_SPECIALITIES} from '@pd/contracts';

/** A speciality of the list in the user's language; one typed by hand as it is. */
@Pipe({name: 'pdSpeciality', pure: false})
export class SpecialityPipe implements PipeTransform {
  private readonly transloco = inject(TranslocoService);

  transform(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    return (HEALTH_SPECIALITIES as readonly string[]).includes(value)
      ? this.transloco.translate(`health.specialities.${value}`)
      : value;
  }
}

/** `PL` → "Poland" in the user's language. */
@Pipe({name: 'pdCountry', pure: false})
export class CountryPipe implements PipeTransform {
  private readonly transloco = inject(TranslocoService);

  transform(code: string | null | undefined): string {
    return code ? countryName(code, this.transloco.getActiveLang()) : '';
  }
}

export function countryName(code: string, language: string): string {
  try {
    return new Intl.DisplayNames([language], {type: 'region'}).of(code) ?? code;
  } catch {
    return code;
  }
}

/** A file size the way people read it: "840 KB", "2.3 MB". */
export function fileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Today as `YYYY-MM-DD` on the user's own clock. */
export function today(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** An emptied field is "nothing", not an empty string, for the server. */
export const orNull = (value: string | null | undefined) =>
  value?.trim() || null;
