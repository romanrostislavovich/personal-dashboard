import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  RecurringPayment,
  RecurringPaymentInput,
  SubscriptionSuggestion,
  Transaction,
  TransactionInput,
  TransactionQuery,
} from '@pd/contracts';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  currentMonth,
  INTEGRATIONS_LINK,
  Month,
  monthAsDate,
  monthRange,
  ProjectsApi,
  shiftMonth,
  todayLocalDate,
} from '@pd/web-core';
import { FinanceApi } from './finance.api';
import { CashFlowChartComponent } from './overview/cash-flow-chart.component';
import { CategoryBreakdownComponent } from './overview/category-breakdown.component';
import { FinanceKpisComponent } from './overview/finance-kpis.component';
import {
  cashFlowMonths,
  CategoryFilter,
  categoryShares,
  topCurrency,
  monthKey,
} from './overview/finance-stats';
import { UpcomingPaymentsComponent } from './overview/upcoming-payments.component';
import {
  RecurringPaymentFormData,
  RecurringPaymentFormDialog,
} from './recurring-payment-form.dialog';
import { TransactionFormData, TransactionFormDialog } from './transaction-form.dialog';
import { TransactionListComponent } from './transactions/transaction-list.component';
import { BudgetsCardComponent } from './budgets/budgets-card.component';
import { GoalsTabComponent } from './goals/goals-tab.component';
import { ReportCardComponent } from './reports/report-card.component';

const DEFAULT_CURRENCY = 'EUR';
/** How many months the cash flow chart shows, the selected one being the last. */
const CHART_MONTHS = 6;
const RECENT_TRANSACTIONS = 6;

enum Tab {
  Overview,
  Transactions,
  Recurring,
  Goals,
}

/** The overview's "everything in the main currency" view. */
const ALL_IN_MAIN = '*';

/** Transactions as amounts in the main currency; those without a rate are left out. */
function inMain(transactions: Transaction[], main: string): Transaction[] {
  return transactions
    .filter((t) => t.mainAmount !== null)
    .map((t) => ({ ...t, amount: t.mainAmount as number, currency: main }));
}

/**
 * Finance for a month, laid out like personal finance apps (Monarch, Zenmoney): the overview
 * answers "how much came in, went out and is left, and where did it go"; the transactions tab
 * is the full list by day. The "wallet" (scope) switches between all transactions, personal ones
 * and those of a specific project. By default everything is converted into the main currency
 * (ECB rates of each transaction's day, see FinanceConversion); a currency chip shows the amounts
 * of one currency as they are.
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
    MatMenuModule,
    MatTooltipModule,
    RouterLink,
    TranslocoPipe,
    FinanceKpisComponent,
    CashFlowChartComponent,
    CategoryBreakdownComponent,
    UpcomingPaymentsComponent,
    TransactionListComponent,
    BudgetsCardComponent,
    GoalsTabComponent,
    ReportCardComponent,
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
  /** `ALL_IN_MAIN` — everything converted; otherwise one currency as it is. */
  protected readonly view = signal<string>(ALL_IN_MAIN);
  protected readonly allInMain = ALL_IN_MAIN;

  protected readonly Tab = Tab;
  protected readonly tab = signal(Tab.Overview);
  /** A category clicked in the overview filters the transactions tab. */
  protected readonly categoryFilter = signal<CategoryFilter | null>(null);
  protected readonly recentCount = RECENT_TRANSACTIONS;

  // --- Data ---
  protected readonly projects = inject(ProjectsApi).list();
  /** Cost import from services is set up in Settings → Integrations. */
  protected readonly integrations = INTEGRATIONS_LINK;
  protected readonly transactions = this.api.transactions(this.query);
  protected readonly cashFlow = this.api.cashFlow(this.chartQuery);
  protected readonly mainFlow = this.api.cashFlowInMain(this.chartQuery);
  protected readonly settings = this.api.settings();
  /** The currency totals are converted into. */
  protected readonly mainCurrency = computed(
    () =>
      this.settings.value()?.effectiveMainCurrency ?? this.mainFlow.value()?.mainCurrency ?? null,
  );
  protected readonly recurringPayments = this.api.recurringPayments();
  /** Their cost together and repeating charges that look like subscriptions. */
  protected readonly subscriptions = this.api.subscriptions();

  protected readonly monthDate = computed(() => monthAsDate(this.month()));
  /** `YYYY-MM` of the selected month: the budgets are monthly. */
  protected readonly monthKey = computed(() => monthKey(this.month()));
  /** Categories used in the month, suggested for a new budget. */
  protected readonly knownCategories = computed(() =>
    [...new Set(this.transactions.value().map((t) => t.category))].sort(),
  );
  /** Trials ending before today are over. */
  protected readonly today = todayLocalDate();
  protected readonly isCurrentMonth = computed(
    () => monthKey(this.month()) === monthKey(currentMonth()),
  );

  /** Currencies of the selected month: each one gets its own overview. */
  protected readonly currencies = computed(() => {
    const key = monthKey(this.month());
    const inMonth = this.cashFlow.value().filter((f) => f.month === key);
    return [...new Set(inMonth.map((f) => f.currency))].sort();
  });

  /** Whether the overview shows converted amounts. */
  protected readonly showsMain = computed(
    () =>
      this.mainCurrency() !== null &&
      (this.view() === ALL_IN_MAIN || !this.currencies().includes(this.view())),
  );

  /** The currency amounts are shown in. */
  protected readonly currency = computed(() => {
    const main = this.mainCurrency();
    if (this.showsMain() && main) {
      return main;
    }
    const key = monthKey(this.month());
    const flows = this.cashFlow.value();
    return (
      topCurrency(flows.filter((f) => f.month === key)) ??
      topCurrency(flows) ??
      this.transactions.value()[0]?.currency ??
      DEFAULT_CURRENCY
    );
  });

  protected readonly chartMonths = computed(() => {
    const flows = this.showsMain()
      ? (this.mainFlow.value()?.months ?? []).map((m) => ({ ...m, currency: this.currency() }))
      : this.cashFlow.value();
    return cashFlowMonths(flows, this.currency(), this.month(), CHART_MONTHS);
  });
  protected readonly currentFlow = computed(() => this.chartMonths()[CHART_MONTHS - 1]);
  protected readonly previousFlow = computed(() => this.chartMonths()[CHART_MONTHS - 2]);
  protected readonly categoryShares = computed(() =>
    categoryShares(
      this.showsMain()
        ? inMain(this.transactions.value(), this.currency())
        : this.transactions.value(),
      this.currency(),
    ),
  );

  /** Currencies converted at today's rate, or not at all (shown under the totals). */
  protected readonly conversion = computed(() => {
    const flow = this.mainFlow.value();
    return this.showsMain() && flow
      ? {
          approximate: flow.approximate,
          missing: flow.missing,
          foreign: this.currencies().some((c) => c !== flow.mainCurrency),
        }
      : null;
  });

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
    this.view.set(currency);
  }

  /** `null` — back to automatic: the currency used most. */
  async setMainCurrency(mainCurrency: string | null): Promise<void> {
    this.settings.set(await firstValueFrom(this.api.saveSettings({ mainCurrency })));
    this.view.set(ALL_IN_MAIN);
    this.transactions.reload();
    this.mainFlow.reload();
  }

  showCategory(filter: CategoryFilter): void {
    this.categoryFilter.set(filter);
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

  async openRecurringForm(
    payment?: RecurringPayment,
    draft?: Partial<RecurringPaymentInput>,
  ): Promise<void> {
    const input = await firstValueFrom(
      this.dialog
        .open<RecurringPaymentFormDialog, RecurringPaymentFormData, RecurringPaymentInput>(
          RecurringPaymentFormDialog,
          { data: { payment: payment ?? null, draft, ...this.formContext() } },
        )
        .afterClosed(),
    );
    if (input) {
      await firstValueFrom(this.api.saveRecurringPayment(input, payment?.id));
      this.recurringPayments.reload();
      this.subscriptions.reload();
    }
  }

  /** A suggested subscription becomes a recurring payment, its fields filled in. */
  addSuggestion(suggestion: SubscriptionSuggestion): Promise<void> {
    const { name, amount, currency, category, dayOfMonth } = suggestion;
    return this.openRecurringForm(undefined, { name, amount, currency, category, dayOfMonth });
  }

  async dismissSuggestion(suggestion: SubscriptionSuggestion): Promise<void> {
    await firstValueFrom(this.api.dismissSubscription(suggestion.key));
    this.subscriptions.reload();
  }

  /** "every 14th" or "yearly, 10 November". */
  protected chargeDay(payment: RecurringPayment): string {
    if (payment.period === 'year' && payment.monthOfYear) {
      const date = new Date(2000, payment.monthOfYear - 1, payment.dayOfMonth);
      return this.transloco.translate('finance.recurring.everyYear', {
        date: date.toLocaleDateString(this.transloco.getActiveLang(), {
          day: 'numeric',
          month: 'long',
        }),
      });
    }
    return this.transloco.translate('finance.recurring.everyMonth', { day: payment.dayOfMonth });
  }

  async removeRecurring(payment: RecurringPayment): Promise<void> {
    if (
      confirm(this.transloco.translate('finance.recurring.confirmDelete', { name: payment.name }))
    ) {
      await firstValueFrom(this.api.removeRecurringPayment(payment.id));
      this.recurringPayments.reload();
      this.subscriptions.reload();
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
