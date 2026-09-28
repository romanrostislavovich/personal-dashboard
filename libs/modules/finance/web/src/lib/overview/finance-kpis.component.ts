import { CurrencyPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { CashFlowMonth, relativeChange } from './finance-stats';

interface Tile {
  key: 'income' | 'expense' | 'left';
  value: number;
  change: number | null;
  /** Whether the change is good news: more income is, more spending is not. */
  good: boolean;
}

/**
 * The three numbers a month is about: earned, spent, left — each compared with the month before.
 */
@Component({
  selector: 'pd-finance-kpis',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, PercentPipe, MatIconModule, TranslocoPipe],
  template: `
    @for (tile of tiles(); track tile.key) {
      <div class="tile">
        <span class="label">{{ 'finance.kpi.' + tile.key | transloco }}</span>
        <span class="value">{{ tile.value | currency: currency() : 'symbol' : '1.0-0' }}</span>
        @if (tile.change !== null) {
          <span class="change" [class.good]="tile.good" [class.bad]="!tile.good">
            <mat-icon inline>{{ tile.change >= 0 ? 'arrow_upward' : 'arrow_downward' }}</mat-icon>
            {{ abs(tile.change) | percent }}
            <span class="vs">{{ 'finance.kpi.vs' | transloco }}</span>
          </span>
        } @else if (tile.key === 'left') {
          <!-- Without income there is no savings rate; the empty line keeps tiles aligned. -->
          <span class="change">
            @if (savingsRate() !== null) {
              {{ 'finance.kpi.savingsRate' | transloco: { rate: (savingsRate() | percent) } }}
            }
          </span>
        } @else {
          <span class="change">{{ 'finance.kpi.noPrevious' | transloco }}</span>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
      gap: 16px;
    }
    .tile {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 20px;
      border: 1px solid var(--pd-border);
      border-radius: var(--pd-radius);
      background: var(--pd-card);
    }
    .label {
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface-variant);
    }
    .value {
      font: 700 2rem / 1.1 var(--pd-font-heading);
      letter-spacing: -0.02em;
    }
    .change {
      min-height: 1.25em;
      display: flex;
      align-items: center;
      gap: 2px;
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .change.good {
      color: var(--pd-success);
    }
    .change.bad {
      color: var(--pd-danger);
    }
    .vs {
      margin-left: 4px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class FinanceKpisComponent {
  /** The selected month. */
  readonly current = input.required<CashFlowMonth>();
  readonly previous = input.required<CashFlowMonth>();
  readonly currency = input.required<string>();

  protected readonly tiles = computed<Tile[]>(() => {
    const now = this.current();
    const before = this.previous();
    const left = now.income - now.expense;
    const leftBefore = before.income - before.expense;
    const incomeChange = relativeChange(now.income, before.income);
    const expenseChange = relativeChange(now.expense, before.expense);
    return [
      { key: 'income', value: now.income, change: incomeChange, good: (incomeChange ?? 0) >= 0 },
      {
        key: 'expense',
        value: now.expense,
        change: expenseChange,
        good: (expenseChange ?? 0) <= 0,
      },
      // A change of "what is left" misleads around zero, so the savings rate is shown instead.
      { key: 'left', value: left, change: null, good: left >= leftBefore },
    ];
  });

  /** The share of income that was not spent. */
  protected readonly savingsRate = computed(() => {
    const { income, expense } = this.current();
    return income > 0 ? Math.max(income - expense, 0) / income : null;
  });

  protected abs(value: number): number {
    return Math.abs(value);
  }
}
