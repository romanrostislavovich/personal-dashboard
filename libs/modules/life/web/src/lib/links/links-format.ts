import {CorrelationMetric} from '@pd/contracts';

/** A colour of a section, the same for it on every chart of the page. */
const PALETTE = [
  '#5c6bc0',
  '#26a69a',
  '#ef6c00',
  '#ab47bc',
  '#8d6e63',
  '#29b6f6',
  '#d4e157',
  '#ec407a',
  '#66bb6a',
  '#ffa726',
  '#78909c',
];

export function moduleColor(module: string): string {
  let hash = 0;
  for (const char of module) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

/** A value in its own unit: 1.5 h, 23:30, 12 €, 18°, 60%; `hours` words the hours. */
export function formatValue(
  metric: Pick<CorrelationMetric, 'unit' | 'currency'>,
  value: number,
  locale: string,
  hours: (value: string) => string,
): string {
  const number = (digits: number) =>
    value.toLocaleString(locale, {maximumFractionDigits: digits});
  switch (metric.unit) {
    case 'hours':
      return hours(number(1));
    case 'clock': {
      const minutes = Math.round(value * 60) % (24 * 60);
      const pad = (part: number) => String(part).padStart(2, '0');
      return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
    }
    case 'money':
      return metric.currency
        ? value.toLocaleString(locale, {
            style: 'currency',
            currency: metric.currency,
            maximumFractionDigits: 0,
          })
        : number(0);
    case 'degrees':
      return `${number(1)}°`;
    case 'percent':
      return `${number(0)}%`;
    default:
      return number(1);
  }
}

/** −1…1 as a colour: the primary for "together", the error colour for "against". */
export function rhoColor(rho: number): string {
  const strength = Math.min(1, Math.abs(rho));
  const colour = rho >= 0 ? 'var(--mat-sys-primary)' : 'var(--mat-sys-error)';
  return `color-mix(in srgb, ${colour} ${Math.round(strength * 100)}%, var(--mat-sys-surface-container))`;
}

export interface SelectedPair {
  a: string;
  b: string;
  lag: 0 | 1;
}
