import { CurrencyPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { categoryIcon } from './category-icon';
import { CategoryFilter, CategoryShare } from './finance-stats';

/**
 * Where the money went: categories from the largest, each with its share of the month.
 * All bars share one color — they compare sizes, not identities. A click filters the list;
 * for "Other" it shows all the categories folded into it.
 */
@Component({
  selector: 'pd-category-breakdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, PercentPipe, MatIconModule, TranslocoPipe],
  template: `
    @for (row of rows(); track row.category) {
      <button type="button" class="row" (click)="select(row)">
        <span class="avatar"
          ><mat-icon>{{ row.category === null ? 'more_horiz' : row.icon }}</mat-icon></span
        >
        <span class="body">
          <span class="line">
            <span class="name">{{ row.category ?? ('finance.categories.other' | transloco) }}</span>
            <span class="amount">{{ row.amount | currency: currency() }}</span>
          </span>
          <span class="track"><span class="fill" [style.width.%]="row.width"></span></span>
          <span class="line meta">
            <span>{{ 'finance.categories.count' | transloco: { count: row.count } }}</span>
            <span>{{ row.share | percent }}</span>
          </span>
        </span>
      </button>
    } @empty {
      <p class="empty">{{ 'finance.categories.empty' | transloco }}</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px;
      margin: 0 -8px;
      border: 0;
      border-radius: var(--pd-radius-small);
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .row:hover,
    .row:focus-visible {
      background: color-mix(in srgb, var(--mat-sys-on-surface) 5%, transparent);
      outline: none;
    }
    .avatar {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    .body {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .line {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font: var(--mat-sys-title-small);
    }
    .amount {
      font: var(--mat-sys-title-small);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .meta {
      font: var(--mat-sys-label-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .track {
      height: 6px;
      border-radius: 3px;
      background: var(--mat-sys-surface-container-highest);
      overflow: hidden;
    }
    .fill {
      display: block;
      height: 100%;
      border-radius: 3px;
      background: var(--mat-sys-primary);
    }
  `,
})
export class CategoryBreakdownComponent {
  readonly shares = input.required<CategoryShare[]>();
  readonly currency = input.required<string>();
  readonly selectCategory = output<CategoryFilter>();

  /** The breakdown is of expenses, so the list shows the expenses it counted. */
  protected select(row: CategoryShare): void {
    this.selectCategory.emit({ label: row.category, categories: row.categories, kind: 'expense' });
  }

  protected readonly rows = computed(() => {
    const max = Math.max(...this.shares().map((s) => s.amount), 0) || 1;
    return this.shares().map((share) => ({
      ...share,
      icon: categoryIcon(share.category, 'expense'),
      // The largest category fills the track: differences between the rest stay visible.
      width: (share.amount / max) * 100,
    }));
  });
}
