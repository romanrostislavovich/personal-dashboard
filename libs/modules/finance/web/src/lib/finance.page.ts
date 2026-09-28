import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  RecurringPayment,
  RecurringPaymentInput,
  Transaction,
  TransactionInput,
  TransactionQuery,
} from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import {
  currentMonth,
  Month,
  monthAsDate,
  monthRange,
  ProjectsApi,
  shiftMonth,
} from '@pd/web-core';
import { CostSourcesTabComponent } from './cost-sources-tab.component';
import { FinanceApi } from './finance.api';
import { CashFlowChartComponent } from './overview/cash-flow-chart.component';
import { CategoryBreakdownComponent } from './overview/category-breakdown.component';
import { FinanceKpisComponent } from './overview/finance-kpis.component';
import { cashFlowMonths, categoryShares, mainCurrency, monthKey } from './overview/finance-stats';
import { UpcomingPaymentsComponent } from './overview/upcoming-payments.component';
import {
  RecurringPaymentFormData,
  RecurringPaymentFormDialog,
} from './recurring-payment-form.dialog';
import { TransactionFormData, TransactionFormDialog } from './transaction-form.dialog';
import { TransactionListComponent } from './transactions/transaction-list.component';

const DEFAULT_CURRENCY = 'EUR';
/** How many months the cash flow chart shows, the selected one being the last. */
const CHART_MONTHS = 6;
const RECENT_TRANSACTIONS = 6;

enum Tab {
  Overview,
  Transactions,
  Recurring,
  CostSources,
}

/**
 * Finance for a month, laid out like personal finance apps (Monarch, Zenmoney): the overview
 * answers "how much came in, went out and is left, and where did it go"; the transactions tab
 * is the full list by day. The "wallet" (scope) switches between all transactions, personal ones
 * and those of a specific project. Amounts in different currencies are never summed — the
 * overview shows one currency at a time.
 */
@Component({
  selector: 'pd-finance-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CurrencyPipe,
    MatCardModule,
    MatChipsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTabsModule,
    MatListModule,
    MatTooltipModule,
    TranslocoPipe,
    CostSourcesTabComponent,
    FinanceKpisComponent,
    CashFlowChartComponent,
    CategoryBreakdownComponent,
    UpcomingPaymentsComponent,
    TransactionListComponent,
  ],
  templateUrl: './finance.page.html',
  styleUrl: './finance.page.scss',
})
export class FinancePage {
  private readonly api = inject(FinanceApi);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  // --- Filters ---
  protected readonly month = signal(currentMonth());
  /** '' — all, 'personal' — personal, otherwise a project id. */
  protected readonly scope = signal<string>('');
  private readonly query = computed<TransactionQuery>(() => ({
    ...monthRange(this.month()),
    scope: this.scope() || undefined,
  }));

  /** The chart looks back several months from the selected one. */
  private readonly chartQuery = computed<TransactionQuery>(() => ({
    from: monthRange(shiftMonth(this.month(), 1 - CHART_MONTHS)).from,
    to: monthRange(this.month()).to,
    scope: this.scope() || undefined,
  }));
  /** Chosen by the user; otherwise the month's main currency. */
  private readonly chosenCurrency = signal<string | null>(null);

  protected readonly Tab = Tab;
  protected readonly tab = signal(Tab.Overview);
  /** A category clicked in the overview filters the transactions tab. */
  protected readonly categoryFilter = signal<string | null>(null);
  protected readonly recentCount = RECENT_TRANSACTIONS;

  // --- Data ---
  protected readonly projects = inject(ProjectsApi).list();
  protected readonly transactions = this.api.transactions(this.query);
  protected readonly cashFlow = this.api.cashFlow(this.chartQuery);
  protected readonly recurringPayments = this.api.recurringPayments();

  protected readonly monthDate = computed(() => monthAsDate(this.month()));
  protected readonly isCurrentMonth = computed(
    () => monthKey(this.month()) === monthKey(currentMonth()),
  );

  /** Currencies of the selected month: each one gets its own overview. */
  protected readonly currencies = computed(() => {
    const key = monthKey(this.month());
    const inMonth = this.cashFlow.value().filter((f) => f.month === key);
    return [...new Set(inMonth.map((f) => f.currency))].sort();
  });

  protected readonly currency = computed(() => {
    const chosen = this.chosenCurrency();
    if (chosen && this.currencies().includes(chosen)) {
      return chosen;
    }
    const key = monthKey(this.month());
    const flows = this.cashFlow.value();
    return (
      mainCurrency(flows.filter((f) => f.month === key)) ??
      mainCurrency(flows) ??
      this.transactions.value()[0]?.currency ??
      DEFAULT_CURRENCY
    );
  });

  protected readonly chartMonths = computed(() =>
    cashFlowMonths(this.cashFlow.value(), this.currency(), this.month(), CHART_MONTHS),
  );
  protected readonly currentFlow = computed(() => this.chartMonths()[CHART_MONTHS - 1]);
  protected readonly previousFlow = computed(() => this.chartMonths()[CHART_MONTHS - 2]);
  protected readonly categoryShares = computed(() =>
    categoryShares(this.transactions.value(), this.currency()),
  );

  protected readonly projectNames = computed(
    () => new Map(this.projects.value().map((project) => [project.id, project.name])),
  );
  private readonly categories = computed(() =>
    [...new Set(this.transactions.value().map((t) => t.category))].sort(),
  );

  shiftMonth(delta: number): void {
    this.month.update((month) => shiftMonth(month, delta));
  }

  selectMonth(month: Month): void {
    this.month.set(month);
  }

  selectCurrency(currency: string): void {
    this.chosenCurrency.set(currency);
  }

  showCategory(category: string): void {
    this.categoryFilter.set(category);
    this.tab.set(Tab.Transactions);
  }

  async openTransactionForm(transaction?: Transaction): Promise<void> {
    const input = await firstValueFrom(
      this.dialog
        .open<TransactionFormDialog, TransactionFormData, TransactionInput>(TransactionFormDialog, {
          data: { transaction: transaction ?? null, ...this.formContext() },
        })
        .afterClosed(),
    );
    if (input) {
      await firstValueFrom(this.api.saveTransaction(input, transaction?.id));
      this.reloadTransactions();
    }
  }

  async removeTransaction(transaction: Transaction): Promise<void> {
    if (confirm(this.transloco.translate('finance.transaction.confirmDelete'))) {
      await firstValueFrom(this.api.removeTransaction(transaction.id));
      this.reloadTransactions();
    }
  }

  async openRecurringForm(payment?: RecurringPayment): Promise<void> {
    const input = await firstValueFrom(
      this.dialog
        .open<RecurringPaymentFormDialog, RecurringPaymentFormData, RecurringPaymentInput>(
          RecurringPaymentFormDialog,
          { data: { payment: payment ?? null, ...this.formContext() } },
        )
        .afterClosed(),
    );
    if (input) {
      await firstValueFrom(this.api.saveRecurringPayment(input, payment?.id));
      this.recurringPayments.reload();
    }
  }

  async removeRecurring(payment: RecurringPayment): Promise<void> {
    if (
      confirm(this.transloco.translate('finance.recurring.confirmDelete', { name: payment.name }))
    ) {
      await firstValueFrom(this.api.removeRecurringPayment(payment.id));
      this.recurringPayments.reload();
    }
  }

  /** Shared data for the forms: projects, categories and defaults. */
  private formContext() {
    const scope = this.scope();
    return {
      projects: this.projects.value(),
      categories: this.categories(),
      defaults: {
        currency: this.currency(),
        // If a project wallet is open, a new record goes straight into it.
        projectId: scope && scope !== 'personal' ? scope : null,
      },
    };
  }

  protected reloadTransactions(): void {
    this.transactions.reload();
    this.cashFlow.reload();
  }
}
