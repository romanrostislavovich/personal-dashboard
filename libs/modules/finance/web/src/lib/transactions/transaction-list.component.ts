import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocalDate, toLocalDate, Transaction, TransactionKind } from '@pd/contracts';
import { todayLocalDate } from '@pd/web-core';
import { categoryIcon } from '../overview/category-icon';
import { CategoryFilter, groupByDay } from '../overview/finance-stats';

/**
 * Transactions grouped by day, like a bank app: a day header with its total, then the rows.
 * With `compact` it is the short "recent" list of the overview: no filters, `limit` rows.
 */
@Component({
  selector: 'pd-transaction-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatTooltipModule,
    TranslocoPipe,
  ],
  templateUrl: './transaction-list.component.html',
  styleUrl: './transaction-list.component.scss',
})
export class TransactionListComponent {
  readonly transactions = input.required<Transaction[]>();
  /** Project names for the wallet caption; personal transactions have none. */
  readonly projectNames = input<Map<string, string>>(new Map());
  readonly compact = input(false);
  /** Amounts in another currency also show their value in this one. */
  readonly mainCurrency = input<string | null>(null);
  readonly limit = input<number | null>(null);
  /** Set from the overview when a category (or "Other") is clicked. */
  readonly category = model<CategoryFilter | null>(null);
  readonly edit = output<Transaction>();
  readonly remove = output<Transaction>();

  protected readonly search = signal('');
  protected readonly kind = signal<TransactionKind | ''>('');

  private readonly today = todayLocalDate();
  private readonly yesterday = shiftDay(this.today, -1);

  protected readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();
    const category = this.category();
    const kind = this.kind();
    const list = this.transactions().filter(
      (t) =>
        (!category || (category.kind === t.kind && category.categories.includes(t.category))) &&
        (!kind || t.kind === kind) &&
        (!query ||
          t.category.toLowerCase().includes(query) ||
          (t.note ?? '').toLowerCase().includes(query)),
    );
    const limit = this.limit();
    return limit ? list.slice(0, limit) : list;
  });

  protected readonly days = computed(() => groupByDay(this.filtered()));

  protected readonly isFiltered = computed(() =>
    Boolean(this.search().trim() || this.category() || this.kind()),
  );

  /** "Today", "Yesterday" or the date — a translation key or null. */
  protected dayLabel(day: LocalDate): string | null {
    if (day === this.today) {
      return 'finance.list.today';
    }
    return day === this.yesterday ? 'finance.list.yesterday' : null;
  }

  protected icon(t: Transaction): string {
    return categoryIcon(t.category, t.kind);
  }

  protected clearFilters(): void {
    this.search.set('');
    this.kind.set('');
    this.category.set(null);
  }
}

function shiftDay(day: LocalDate, delta: number): LocalDate {
  // Noon: a daylight saving shift cannot move the date.
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + delta);
  return toLocalDate({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
}
