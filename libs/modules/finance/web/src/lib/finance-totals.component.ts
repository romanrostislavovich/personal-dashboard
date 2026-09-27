import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CurrencyTotals } from '@pd/contracts';

/** Income / expenses / balance — one row per currency. */
@Component({
  selector: 'pd-finance-totals',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, TranslocoPipe],
  template: `
    @for (total of totals(); track total.currency) {
      <div class="totals">
        <div class="item">
          <span class="label">{{ 'finance.kind.income' | transloco }}</span>
          <span class="value income">{{ total.income | currency: total.currency }}</span>
        </div>
        <div class="item">
          <span class="label">{{ 'finance.kind.expense' | transloco }}</span>
          <span class="value expense">{{ total.expense | currency: total.currency }}</span>
        </div>
        <div class="item">
          <span class="label">{{ 'finance.balance' | transloco }}</span>
          <span class="value" [class.expense]="total.balance < 0">{{
            total.balance | currency: total.currency
          }}</span>
        </div>
      </div>
    } @empty {
      <p class="empty">{{ 'finance.noData' | transloco }}</p>
    }
  `,
  styles: `
    .totals {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      padding: 8px 0;
    }
    .item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .label {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .value {
      font: var(--mat-sys-title-large);
    }
  `,
})
export class FinanceTotalsComponent {
  readonly totals = input.required<CurrencyTotals[]>();
}
