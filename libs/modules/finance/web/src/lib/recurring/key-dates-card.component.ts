import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { KeyDate, KeyDateKind } from '@pd/contracts';
import { todayLocalDate } from '@pd/web-core';

const ICONS: Record<KeyDateKind, string> = {
  'cancel-by': 'edit_document',
  'term-end': 'event_busy',
  'price-lock': 'lock_clock',
  trial: 'hourglass_bottom',
  renewal: 'autorenew',
};

/** A date within this many days is marked as near. */
const SOON_DAYS = 14;

/**
 * The calendar of key dates a year ahead, month by month: the last day to give notice of a
 * contract, the end of a term or a fixed price, a free trial, a yearly charge.
 */
@Component({
  selector: 'pd-key-dates-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.none]': '!dates().length' },
  imports: [CurrencyPipe, DatePipe, MatCardModule, MatIconModule, TranslocoPipe],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{ 'finance.keyDates.title' | transloco }}</mat-card-title>
        <mat-card-subtitle>{{ 'finance.keyDates.hint' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @for (month of months(); track month.key) {
          <h3 class="month">{{ month.date | date: 'LLLL yyyy' }}</h3>
          <ul>
            @for (date of month.dates; track $index) {
              <li [class.soon]="date.date <= soon">
                <span class="day">{{ date.date | date: 'd MMM' }}</span>
                <mat-icon aria-hidden="true">{{ icons[date.kind] }}</mat-icon>
                <span class="what">
                  <b>{{ date.name }}</b> · {{ 'finance.keyDates.kind.' + date.kind | transloco }}
                </span>
                <span class="amount">{{ date.amount | currency: date.currency }}</span>
              </li>
            }
          </ul>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    :host(.none) {
      display: none;
    }
    .month {
      margin: 12px 0 4px;
      font: var(--mat-sys-title-small);
      color: var(--mat-sys-on-surface-variant);
      text-transform: capitalize;
    }
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: grid;
      grid-template-columns: 64px 24px 1fr auto;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 8px;
    }
    li.soon {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    .day {
      font-variant-numeric: tabular-nums;
      font-weight: 500;
    }
    .what {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .amount {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
  `,
})
export class KeyDatesCardComponent {
  readonly dates = input.required<KeyDate[]>();

  protected readonly icons = ICONS;
  protected readonly soon = new Date(Date.parse(todayLocalDate()) + SOON_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  protected readonly months = computed(() => {
    const byMonth = new Map<string, KeyDate[]>();
    for (const date of this.dates()) {
      const key = date.date.slice(0, 7);
      byMonth.set(key, [...(byMonth.get(key) ?? []), date]);
    }
    return [...byMonth].map(([key, dates]) => ({ key, date: `${key}-01`, dates }));
  });
}
