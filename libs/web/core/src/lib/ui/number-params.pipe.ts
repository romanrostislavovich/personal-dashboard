import {formatNumber} from '@angular/common';
import {inject, LOCALE_ID, Pipe, PipeTransform} from '@angular/core';

/**
 * The numbers of a server text's parameters formatted for the reader ("12 345", not "12345"),
 * the rest as they are: `{{ key | transloco: (params | pdNumberParams) }}`.
 */
@Pipe({name: 'pdNumberParams'})
export class NumberParamsPipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(
    params: Record<string, string | number> | null | undefined,
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries(params ?? {}).map(([name, value]) => [
        name,
        typeof value === 'number' ? formatNumber(value, this.locale) : value,
      ]),
    );
  }
}
