import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { FinanceApi } from '../finance.api';
import { priceTrend } from './wish-view';

const SHOWN = 5;

/** Home widget: what is still wanted, with the price now and how it last moved. */
@Component({
  selector: 'pd-wishlist-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, RouterLink, MatCardModule, MatButtonModule, MatIconModule, TranslocoPipe],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>🎁 {{ 'finance.wishlist.widgetTitle' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @for (wish of wanted(); track wish.id) {
          <div class="wish">
            <a class="name" [href]="wish.url" target="_blank" rel="noopener noreferrer">{{
              wish.name
            }}</a>
            @if (trend(wish); as t) {
              <span class="change" [class.down]="t.down" [class.up]="!t.down">
                <mat-icon inline>{{ t.down ? 'south_east' : 'north_east' }}</mat-icon>
                {{ t.percent }}%
              </span>
            }
            @if (wish.price !== null && wish.currency) {
              <span>{{ wish.price | currency: wish.currency }}</span>
            } @else {
              <span class="muted">—</span>
            }
          </div>
        } @empty {
          @if (!wishes.isLoading()) {
            <p class="muted">{{ 'finance.wishlist.widgetEmpty' | transloco }}</p>
          }
        }
      </mat-card-content>
      <mat-card-actions align="end">
        <a matButton routerLink="/finance" [queryParams]="{ tab: 'wishlist' }">{{
          'finance.widget.open' | transloco
        }}</a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .wish {
      display: flex;
      align-items: baseline;
      gap: 8px;
      padding: 2px 0;
    }
    .name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: inherit;
      text-decoration: none;
    }
    .name:hover {
      text-decoration: underline;
    }
    .change {
      font: var(--mat-sys-label-medium);
    }
    .down {
      color: var(--mat-sys-primary);
    }
    .up {
      color: var(--mat-sys-error);
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class WishlistWidget {
  protected readonly wishes = inject(FinanceApi).wishlist();
  protected readonly wanted = computed(() =>
    this.wishes
      .value()
      .filter((wish) => !wish.boughtAt)
      .slice(0, SHOWN),
  );
  protected readonly trend = priceTrend;
}
