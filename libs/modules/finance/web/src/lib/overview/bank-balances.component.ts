import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { FinanceApi } from '../finance.api';

/**
 * What is on the bank accounts now, as the bank said at its latest import: one line per
 * imported account. Nothing when no bank is connected.
 */
@Component({
  selector: 'pd-bank-balances',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, DatePipe, MatIconModule, TranslocoPipe],
  template: `
    @if (accounts().length) {
      <div class="balances">
        <mat-icon>account_balance</mat-icon>
        @for (account of accounts(); track account.id) {
          <span
            class="account"
            [title]="'finance.bank.balanceAt' | transloco: { date: (account.at | date: 'short') }"
          >
            <span class="name">{{ account.label }}</span>
            <span class="value">{{
              account.amount | currency: account.currency : 'symbol' : '1.2-2'
            }}</span>
          </span>
        }
      </div>
    }
  `,
  styles: `
    .balances {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 20px;
      color: var(--mat-sys-on-surface-variant);
    }
    .account {
      display: inline-flex;
      align-items: baseline;
      gap: 8px;
    }
    .name {
      font: var(--mat-sys-body-small);
    }
    .value {
      font: var(--mat-sys-title-medium);
      color: var(--mat-sys-on-surface);
    }
  `,
})
export class BankBalancesComponent {
  private readonly state = inject(FinanceApi).bank();

  protected readonly accounts = computed(() =>
    (this.state.value()?.connections ?? []).flatMap((connection) =>
      connection.accounts
        .filter((account) => account.enabled && account.balance)
        .map((account) => ({
          id: account.id,
          label: [connection.bank, account.ibanEnd ? `••${account.ibanEnd}` : null]
            .filter(Boolean)
            .join(' '),
          amount: account.balance?.amount ?? 0,
          currency: account.balance?.currency ?? 'PLN',
          at: account.balance?.at ?? null,
        })),
    ),
  );
}
