import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { RecurringPayment } from '@pd/contracts';
import { Month, monthRange } from '@pd/web-core';

/**
 * Recurring payments still to be charged this month — what is already "spoken for".
 * Only the current month has upcoming payments; past months are history.
 */
@Component({
  selector: 'pd-upcoming-payments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, MatIconModule, TranslocoPipe],
  template: `
    @for (p of upcoming(); track p.id) {
      <div class="row">
        <span class="day">
          <b>{{ p.dayOfMonth }}</b>
        </span>
        <span class="name">{{ p.name }}</span>
        <span class="amount">{{ p.amount | currency: p.currency }}</span>
      </div>
    } @empty {
      <p class="empty">
        @if (hasActive()) {
          <mat-icon inline>check_circle</mat-icon> {{ 'finance.upcoming.none' | transloco }}
        } @else {
          {{ 'finance.upcoming.noPayments' | transloco }}
        }
      </p>
    }
    @if (totals().length) {
      <div class="total">
        <span>{{ 'finance.upcoming.total' | transloco }}</span>
        <span>
          @for (t of totals(); track t.currency; let last = $last) {
            {{ t.amount | currency: t.currency }}{{ last ? '' : ' · ' }}
          }
        </span>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 0;
    }
    .day {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      border-radius: var(--pd-radius-small);
      background: var(--mat-sys-surface-container-high);
      font: var(--mat-sys-label-large);
    }
    .name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .amount {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .total {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-top: 8px;
      padding-top: 12px;
      border-top: 1px solid var(--mat-sys-outline-variant);
      font: var(--mat-sys-title-small);
    }
    .empty {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 8px 0;
    }
  `,
})
export class UpcomingPaymentsComponent {
  readonly payments = input.required<RecurringPayment[]>();
  readonly month = input.required<Month>();

  protected readonly upcoming = computed(() => {
    const { from, to } = monthRange(this.month());
    // A yearly payment only in its month; a free trial ending after this month costs nothing yet.
    return this.payments()
      .filter(
        (p) =>
          p.isActive &&
          (!p.lastChargedOn || p.lastChargedOn < from) &&
          (p.period !== 'year' || p.monthOfYear === this.month().month) &&
          (!p.trialEndsOn || p.trialEndsOn <= to),
      )
      .sort((a, b) => a.dayOfMonth - b.dayOfMonth);
  });

  protected readonly hasActive = computed(() => this.payments().some((p) => p.isActive));

  protected readonly totals = computed(() => {
    const byCurrency = new Map<string, number>();
    for (const p of this.upcoming()) {
      byCurrency.set(p.currency, (byCurrency.get(p.currency) ?? 0) + p.amount);
    }
    return [...byCurrency].map(([currency, amount]) => ({ currency, amount }));
  });
}
