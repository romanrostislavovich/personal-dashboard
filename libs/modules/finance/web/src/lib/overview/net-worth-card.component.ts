import {CurrencyPipe, DecimalPipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {TranslocoPipe} from '@jsverse/transloco';
import {SparklineComponent} from '@pd/web-core';
import {firstValueFrom} from 'rxjs';
import {FinanceApi} from '../finance.api';
import {AssetsDialog} from './assets.dialog';

/** A runway shorter than this many months is a warning; longer than the second is calm. */
const RUNWAY_LOW = 3;
const RUNWAY_GOOD = 6;

/**
 * Net worth and runway: what one has minus the debts (the bank accounts by themselves, the rest
 * typed in), its history, the average spending of a month and for how long the money at hand
 * would last at it.
 */
@Component({
  selector: 'pd-net-worth-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    SparklineComponent,
    TranslocoPipe,
  ],
  template: `
    @if (worth.value(); as w) {
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-card-title>{{
            'finance.worth.title' | transloco
          }}</mat-card-title>
          <mat-card-subtitle>{{
            'finance.worth.subtitle' | transloco
          }}</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @if (w.items.length) {
            <div class="numbers">
              <div class="figure">
                <span class="label">{{
                  'finance.worth.total' | transloco
                }}</span>
                <span class="big" [class.negative]="w.total < 0">{{
                  w.total | currency: w.currency : 'symbol' : '1.0-0'
                }}</span>
                @if (change(); as c) {
                  <span class="change" [class.up]="c > 0" [class.down]="c < 0">
                    <mat-icon inline>{{
                      c >= 0 ? 'trending_up' : 'trending_down'
                    }}</mat-icon>
                    {{ c > 0 ? '+' : ''
                    }}{{ c | currency: w.currency : 'symbol' : '1.0-0' }}
                    {{ 'finance.worth.over30' | transloco }}
                  </span>
                }
              </div>
              <div class="figure">
                <span class="label">{{
                  'finance.worth.runway' | transloco
                }}</span>
                @if (w.runwayMonths !== null) {
                  <span
                    class="big"
                    [class.low]="w.runwayMonths < low"
                    [class.good]="w.runwayMonths >= good"
                    >{{
                      'finance.worth.months'
                        | transloco: {count: (w.runwayMonths | number: '1.0-1')}
                    }}</span
                  >
                  <span class="note">{{
                    (w.burnMonths
                      ? 'finance.worth.runwayHint'
                      : 'finance.worth.runwayHint30'
                    )
                      | transloco
                        : {
                            liquid:
                              (w.liquid
                              | currency: w.currency : 'symbol' : '1.0-0'),
                            burn:
                              (w.burnPerMonth
                              | currency: w.currency : 'symbol' : '1.0-0'),
                            months: w.burnMonths,
                          }
                  }}</span>
                } @else {
                  <span class="note">{{
                    'finance.worth.noBurn' | transloco
                  }}</span>
                }
              </div>
            </div>
            @if (points().length > 1) {
              <pd-sparkline
                class="history"
                [points]="points()"
                [label]="'finance.worth.history' | transloco"
                [unit]="' ' + w.currency"
                [showAxis]="true"
              />
            }
            <ul class="items">
              @for (item of w.items; track item.source + item.id) {
                <li>
                  <mat-icon aria-hidden="true">{{
                    icon(item.kind, item.source)
                  }}</mat-icon>
                  <span class="name">{{ item.name }}</span>
                  <span class="kind">{{
                    'finance.assets.kinds.' + item.kind | transloco
                  }}</span>
                  <span
                    class="amount"
                    [class.negative]="(item.inMain ?? 0) < 0"
                  >
                    {{ item.kind === 'debt' ? '−' : ''
                    }}{{
                      item.amount | currency: item.currency : 'symbol' : '1.0-0'
                    }}
                  </span>
                </li>
              }
            </ul>
            @if (w.missing.length) {
              <p class="note">
                {{
                  'finance.worth.missing'
                    | transloco: {currencies: w.missing.join(', ')}
                }}
              </p>
            }
          } @else {
            <p class="note">{{ 'finance.worth.empty' | transloco }}</p>
          }
        </mat-card-content>
        <mat-card-actions align="end">
          <button matButton (click)="edit()">
            <mat-icon>edit</mat-icon> {{ 'finance.worth.edit' | transloco }}
          </button>
        </mat-card-actions>
      </mat-card>
    }
  `,
  styles: `
    .numbers {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
      gap: 16px;
      margin-bottom: 12px;
    }
    .figure {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .label {
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface-variant);
    }
    .big {
      font: var(--mat-sys-display-small);
      font-variant-numeric: tabular-nums;
    }
    .big.low,
    .negative {
      color: var(--mat-sys-error);
    }
    .big.good {
      color: var(--pd-chart-income);
    }
    .change {
      display: flex;
      align-items: center;
      gap: 4px;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .change.up {
      color: var(--pd-chart-income);
    }
    .change.down {
      color: var(--mat-sys-error);
    }
    .note {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .history {
      display: block;
      margin: 8px 0 16px;
    }
    .items {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .items li {
      display: grid;
      grid-template-columns: 24px 1fr auto auto;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
    .kind {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .amount {
      font-variant-numeric: tabular-nums;
      text-align: right;
      white-space: nowrap;
    }
  `,
})
export class NetWorthCardComponent {
  private readonly api = inject(FinanceApi);
  private readonly dialog = inject(MatDialog);

  protected readonly worth = this.api.worth();
  protected readonly low = RUNWAY_LOW;
  protected readonly good = RUNWAY_GOOD;

  protected readonly points = computed(() =>
    (this.worth.value()?.history ?? []).map(point => ({
      at: point.day,
      value: point.total,
    })),
  );

  protected readonly change = computed(() => {
    const worth = this.worth.value();
    return worth && worth.monthAgo !== null
      ? Math.round(worth.total - worth.monthAgo)
      : null;
  });

  protected icon(kind: string, source: 'bank' | 'manual'): string {
    if (source === 'bank') {
      return 'account_balance';
    }
    return (
      {
        cash: 'payments',
        account: 'account_balance_wallet',
        deposit: 'savings',
        investment: 'show_chart',
        property: 'home',
        debt: 'credit_card_off',
      }[kind] ?? 'paid'
    );
  }

  async edit(): Promise<void> {
    await firstValueFrom(
      this.dialog
        .open(AssetsDialog, {data: this.worth.value()?.currency ?? 'EUR'})
        .afterClosed(),
    );
    this.worth.reload();
  }
}
