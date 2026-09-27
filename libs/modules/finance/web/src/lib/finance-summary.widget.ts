import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { FinanceApi } from './finance.api';
import { FinanceTotalsComponent } from './finance-totals.component';
import { currentMonth, monthAsDate, monthRange } from '@pd/web-core';

/** Home widget: current month totals across all wallets. */
@Component({
  selector: 'pd-finance-summary-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    TranslocoPipe,
    FinanceTotalsComponent,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>💰 {{ 'finance.widget.title' | transloco }}</mat-card-title>
        <mat-card-subtitle class="month">{{ monthDate | date: 'LLLL yyyy' }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <pd-finance-totals [totals]="summary.value()?.totals ?? []" />
        @for (
          item of summary.value()?.topExpenseCategories ?? [];
          track item.category + item.currency
        ) {
          <div class="category-row">
            <span>{{ item.category }}</span>
            <span class="expense">{{ item.expense | currency: item.currency }}</span>
          </div>
        }
      </mat-card-content>
      <mat-card-actions align="end">
        <a matButton routerLink="/finance">{{ 'finance.widget.open' | transloco }}</a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .month {
      text-transform: capitalize;
    }
    .category-row {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
    }
  `,
})
export class FinanceSummaryWidget {
  private readonly month = currentMonth();
  protected readonly monthDate = monthAsDate(this.month);
  protected readonly summary = inject(FinanceApi).summary(() => monthRange(this.month));
}
