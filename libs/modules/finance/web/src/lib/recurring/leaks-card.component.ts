import {CurrencyPipe, DatePipe} from '@angular/common';
import {ChangeDetectionStrategy, Component, input, output} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {MatListModule} from '@angular/material/list';
import {MatTooltipModule} from '@angular/material/tooltip';
import {TranslocoPipe} from '@jsverse/transloco';
import {LeakKind, SubscriptionLeak, Subscriptions} from '@pd/contracts';

const ICONS: Record<LeakKind, string> = {
  rising: 'trending_up',
  double: 'content_copy',
  unused: 'money_off',
  hidden: 'visibility',
  renewal: 'event_upcoming',
};

/**
 * The check of the subscriptions: where the money leaks and what it costs a year — a price
 * that crept up, a double charge, a subscription not used or never recorded, a renewal near.
 */
@Component({
  selector: 'pd-leaks-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatListModule,
    MatTooltipModule,
    TranslocoPipe,
  ],
  template: `
    @let subs = subscriptions();
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{ 'finance.leaks.title' | transloco }}</mat-card-title>
        <mat-card-subtitle>
          @if (subs.leaksPerYear > 0) {
            {{
              'finance.leaks.perYear'
                | transloco
                  : {
                      amount:
                        (subs.leaksPerYear
                        | currency: subs.currency : 'symbol' : '1.0-0'),
                    }
            }}
          } @else if (subs.leaks.length) {
            {{ 'finance.leaks.onlyDates' | transloco }}
          } @else {
            {{ 'finance.leaks.none' | transloco }}
          }
        </mat-card-subtitle>
      </mat-card-header>
      @if (subs.leaks.length) {
        <mat-list>
          @for (leak of subs.leaks; track $index) {
            <mat-list-item>
              <mat-icon
                matListItemIcon
                [class.warn]="leak.kind !== 'renewal'"
                >{{ icons[leak.kind] }}</mat-icon
              >
              <span matListItemTitle>{{ leak.name }}</span>
              <span matListItemLine>{{
                line(leak)
                  | transloco
                    : {
                        amount: (leak.amount | currency: leak.currency),
                        previous: (leak.previous | currency: leak.currency),
                        date: (leak.date | date: 'd MMM y'),
                        month: (leak.date | date: 'LLLL'),
                      }
              }}</span>
              <div matListItemMeta class="meta">
                @if (leak.perYear) {
                  <span
                    class="amount"
                    [matTooltip]="'finance.leaks.perYearHint' | transloco"
                    >{{
                      leak.perYear
                        | currency: subs.currency : 'symbol' : '1.0-0'
                    }}</span
                  >
                }
                @if (leak.kind === 'hidden' && leak.key) {
                  <button matButton (click)="add.emit(leak.key)">
                    {{ 'core.actions.add' | transloco }}
                  </button>
                  <button
                    matIconButton
                    [matTooltip]="
                      'finance.recurring.notSubscription' | transloco
                    "
                    [attr.aria-label]="
                      'finance.recurring.notSubscription' | transloco
                    "
                    (click)="dismiss.emit(leak.key)"
                  >
                    <mat-icon>close</mat-icon>
                  </button>
                }
              </div>
            </mat-list-item>
          }
        </mat-list>
      }
    </mat-card>
  `,
  styles: `
    .warn {
      color: var(--mat-sys-error);
    }
    .meta {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .amount {
      font-variant-numeric: tabular-nums;
      color: var(--mat-sys-error);
      white-space: nowrap;
    }
  `,
})
export class LeaksCardComponent {
  readonly subscriptions = input.required<Subscriptions>();
  /** "Add" on a charge never recorded: its key. */
  readonly add = output<string>();
  /** "Not a subscription": its key. */
  readonly dismiss = output<string>();

  protected readonly icons = ICONS;

  protected line(leak: SubscriptionLeak): string {
    return leak.kind === 'renewal'
      ? `finance.leaks.renewal.${leak.key ?? 'renewal'}`
      : `finance.leaks.${leak.kind}`;
  }
}
