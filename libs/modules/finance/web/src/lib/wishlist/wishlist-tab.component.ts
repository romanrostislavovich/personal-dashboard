import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Wish, WishInput } from '@pd/contracts';
import { SparklineComponent, SparklinePoint } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { FinanceApi } from '../finance.api';
import { WishFormData, WishFormDialog } from './wish-form.dialog';
import { priceTrend, shopName } from './wish-view';

/**
 * The wishlist: products to buy one day. Each card shows the price the shop asks now, how it
 * changed, and its history as a chart; the server reads the prices every morning.
 */
@Component({
  selector: 'pd-wishlist-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    TranslocoPipe,
    SparklineComponent,
  ],
  template: `
    <div class="actions">
      <p class="hint">{{ 'finance.wishlist.hint' | transloco }}</p>
      <button matButton="filled" [disabled]="busy() !== null" (click)="openForm()">
        <mat-icon>add</mat-icon> {{ 'finance.wishlist.add' | transloco }}
      </button>
    </div>
    @if (busy() === adding) {
      <p class="hint">{{ 'finance.wishlist.adding' | transloco }}</p>
      <mat-progress-bar mode="indeterminate" />
    }

    <div class="wishes">
      @for (wish of wishes.value(); track wish.id) {
        <mat-card appearance="outlined" [class.bought]="wish.boughtAt">
          <mat-card-header>
            @if (wish.imageUrl) {
              <img mat-card-avatar [src]="wish.imageUrl" alt="" loading="lazy" />
            } @else {
              <mat-icon mat-card-avatar>redeem</mat-icon>
            }
            <mat-card-title>{{ wish.name }}</mat-card-title>
            <mat-card-subtitle>
              <a [href]="wish.url" target="_blank" rel="noopener noreferrer">{{ shop(wish) }}</a>
              @if (wish.boughtAt) {
                · {{ 'finance.wishlist.bought' | transloco }}
                {{ wish.boughtAt | date: 'd MMM y' }}
              } @else if (wish.checkedAt) {
                ·
                {{
                  'finance.wishlist.checked'
                    | transloco: { date: (wish.checkedAt | date: 'd MMM, HH:mm') }
                }}
              }
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="amounts">
              @if (wish.price !== null && wish.currency) {
                <span class="price">{{ wish.price | currency: wish.currency }}</span>
                @if (trend(wish); as t) {
                  <span class="change" [class.down]="t.down" [class.up]="!t.down">
                    <mat-icon inline>{{ t.down ? 'south_east' : 'north_east' }}</mat-icon>
                    {{ t.percent }}%
                  </span>
                  <span class="was">{{
                    'finance.wishlist.was'
                      | transloco: { amount: (wish.previousPrice | currency: wish.currency) }
                  }}</span>
                }
              } @else {
                <span class="no-price">{{ 'finance.wishlist.noPrice' | transloco }}</span>
              }
            </div>
            @if (
              wish.currency &&
              wish.lowestPrice !== null &&
              wish.highestPrice !== null &&
              wish.lowestPrice < wish.highestPrice
            ) {
              <p class="range">
                {{
                  'finance.wishlist.range'
                    | transloco
                      : {
                          lowest: (wish.lowestPrice | currency: wish.currency),
                          highest: (wish.highestPrice | currency: wish.currency),
                        }
                }}
                @if (wish.price === wish.lowestPrice) {
                  · <span class="down">{{ 'finance.wishlist.lowestNow' | transloco }}</span>
                }
              </p>
            }
            @if (wish.checkError && !wish.boughtAt) {
              <p class="warning">
                <mat-icon inline>warning</mat-icon>
                {{ 'finance.wishlist.unreadable' | transloco: { error: wish.checkError } }}
              </p>
            }
            @if (wish.note) {
              <p class="note">{{ wish.note }}</p>
            }

            @if (open() === wish.id) {
              <div class="history">
                @if (points().length > 1) {
                  <pd-sparkline
                    [points]="points()"
                    dateFormat="d MMM y"
                    [unit]="' ' + wish.currency"
                    [label]="'finance.wishlist.history' | transloco"
                  />
                } @else if (!history.isLoading()) {
                  <p class="hint">{{ 'finance.wishlist.noHistory' | transloco }}</p>
                }
              </div>
            }
            @if (busy() === wish.id) {
              <mat-progress-bar mode="indeterminate" />
            }
          </mat-card-content>
          <mat-card-actions align="end">
            <button matButton (click)="setBought(wish, !wish.boughtAt)">
              <mat-icon>{{ wish.boughtAt ? 'undo' : 'check' }}</mat-icon>
              {{
                (wish.boughtAt ? 'finance.wishlist.unmarkBought' : 'finance.wishlist.markBought')
                  | transloco
              }}
            </button>
            @if (!wish.boughtAt) {
              <button
                matIconButton
                [disabled]="busy() !== null"
                [matTooltip]="'finance.wishlist.check' | transloco"
                [attr.aria-label]="'finance.wishlist.check' | transloco"
                (click)="check(wish)"
              >
                <mat-icon>refresh</mat-icon>
              </button>
            }
            <button
              matIconButton
              [matTooltip]="'finance.wishlist.history' | transloco"
              [attr.aria-label]="'finance.wishlist.history' | transloco"
              (click)="toggleHistory(wish.id)"
            >
              <mat-icon>show_chart</mat-icon>
            </button>
            <button
              matIconButton
              [attr.aria-label]="'core.actions.edit' | transloco"
              (click)="openForm(wish)"
            >
              <mat-icon>edit</mat-icon>
            </button>
            <button
              matIconButton
              [attr.aria-label]="'core.actions.delete' | transloco"
              (click)="remove(wish)"
            >
              <mat-icon>delete</mat-icon>
            </button>
          </mat-card-actions>
        </mat-card>
      } @empty {
        @if (!wishes.isLoading() && busy() === null) {
          <p class="hint">{{ 'finance.wishlist.empty' | transloco }}</p>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-top: 16px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .wishes {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr));
      gap: 16px;
    }
    img[mat-card-avatar] {
      object-fit: contain;
      border-radius: var(--pd-radius-small, 8px);
      background: var(--mat-sys-surface-container-highest);
    }
    mat-icon[mat-card-avatar] {
      display: grid;
      place-items: center;
      color: var(--mat-sys-primary);
    }
    mat-card-title {
      overflow: hidden;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }
    mat-card-subtitle a {
      color: inherit;
    }
    .amounts {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 8px;
      margin: 8px 0;
    }
    .price {
      font: var(--mat-sys-headline-small);
    }
    .change {
      font: var(--mat-sys-label-large);
    }
    .down {
      color: var(--mat-sys-primary);
    }
    .up {
      color: var(--mat-sys-error);
    }
    .was,
    .range,
    .note,
    .hint,
    .no-price {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .no-price {
      font: var(--mat-sys-title-medium);
    }
    .warning {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
    .history {
      margin-top: 12px;
    }
    .bought {
      opacity: 0.7;
    }
  `,
})
export class WishlistTabComponent {
  /** A price typed in by hand starts in it. */
  readonly currency = input.required<string>();

  private readonly api = inject(FinanceApi);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly wishes = this.api.wishlist();
  /** The wish whose price history is shown. */
  protected readonly open = signal<string | null>(null);
  protected readonly history = this.api.wishPrices(this.open);
  protected readonly points = computed<SparklinePoint[]>(() =>
    this.history.value().map(({ day, price }) => ({ at: day, value: price })),
  );

  /** A page is being read: the id of the wish, or `adding` for a new one. */
  protected readonly busy = signal<string | null>(null);
  protected readonly adding = 'new';

  protected readonly trend = priceTrend;
  protected readonly shop = shopName;

  protected toggleHistory(id: string): void {
    this.open.update((current) => (current === id ? null : id));
  }

  protected async openForm(wish?: Wish): Promise<void> {
    const input = await firstValueFrom(
      this.dialog
        .open<WishFormDialog, WishFormData, WishInput>(WishFormDialog, {
          data: { wish: wish ?? null, currency: this.currency() },
        })
        .afterClosed(),
    );
    if (input) {
      // A new wish waits for the shop's page: seconds, not an instant.
      await this.reading(wish?.id ?? this.adding, () => this.api.saveWish(input, wish?.id));
    }
  }

  protected check(wish: Wish): Promise<void> {
    return this.reading(wish.id, () => this.api.checkWish(wish.id));
  }

  protected async setBought(wish: Wish, bought: boolean): Promise<void> {
    await firstValueFrom(this.api.setWishBought(wish.id, bought));
    this.wishes.reload();
  }

  protected async remove(wish: Wish): Promise<void> {
    if (confirm(this.transloco.translate('finance.wishlist.confirmDelete', { name: wish.name }))) {
      await firstValueFrom(this.api.removeWish(wish.id));
      this.wishes.reload();
    }
  }

  private async reading(id: string, request: () => ReturnType<FinanceApi['checkWish']>) {
    this.busy.set(id);
    try {
      await firstValueFrom(request());
    } finally {
      this.busy.set(null);
      this.wishes.reload();
      this.history.reload();
    }
  }
}
