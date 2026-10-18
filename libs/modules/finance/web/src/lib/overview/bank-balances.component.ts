import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { FinanceApi } from '../finance.api';

/**
 * What is on the bank accounts now, as the bank said at its latest import: a tile per imported
 * account, in the look of the month's tiles below it. Nothing when no bank is connected.
 */
@Component({
  selector: 'pd-bank-balances',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.none]': '!accounts().length' },
  imports: [CurrencyPipe, DatePipe, MatIconModule, TranslocoPipe],
  template: `
    @for (account of accounts(); track account.id) {
      <div class="tile">
        <span class="label">
          <mat-icon inline>account_balance</mat-icon>
          {{ 'finance.bank.onAccount' | transloco }}
        </span>
        <span class="value" [class.negative]="account.amount < 0">
          {{ account.amount | currency: account.currency : 'symbol' : '1.2-2' }}
        </span>
        <span class="source">
          {{ account.label }}
          @if (account.at) {
            ·
            {{
              'finance.bank.balanceAt' | transloco: { date: (account.at | date: 'd MMM, HH:mm') }
            }}
          }
        </span>
      </div>
    }
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
      gap: 16px;
    }
    :host(.none) {
      display: none;
    }
    .tile {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 20px;
      border-radius: var(--pd-radius);
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }
    .label {
      display: flex;
      align-items: center;
      gap: 6px;
      font: var(--mat-sys-label-large);
    }
    .value {
      font: 700 2.5rem / 1.1 var(--pd-font-heading);
      letter-spacing: -0.02em;
    }
    .value.negative {
      color: var(--pd-danger);
    }
    .source {
      font: var(--mat-sys-label-medium);
      opacity: 0.8;
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
