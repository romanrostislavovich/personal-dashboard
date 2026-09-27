import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
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
import { CostSourcesTabComponent } from './cost-sources-tab.component';
import { FinanceApi } from './finance.api';
import { FinanceTotalsComponent } from './finance-totals.component';
import { currentMonth, monthAsDate, monthRange, ProjectsApi, shiftMonth } from '@pd/web-core';
import {
  RecurringPaymentFormData,
  RecurringPaymentFormDialog,
} from './recurring-payment-form.dialog';
import { TransactionFormData, TransactionFormDialog } from './transaction-form.dialog';

const DEFAULT_CURRENCY = 'EUR';

/**
 * Finance for a month. The "wallet" (scope) switches between all transactions,
 * personal ones and those of a specific project.
 */
@Component({
  selector: 'pd-finance-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CurrencyPipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTabsModule,
    MatListModule,
    MatTooltipModule,
    TranslocoPipe,
    FinanceTotalsComponent,
    CostSourcesTabComponent,
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

  // --- Data ---
  protected readonly projects = inject(ProjectsApi).list();
  protected readonly transactions = this.api.transactions(this.query);
  protected readonly summary = this.api.summary(this.query);
  protected readonly recurringPayments = this.api.recurringPayments();

  protected readonly monthDate = computed(() => monthAsDate(this.month()));
  protected readonly projectNames = computed(
    () => new Map(this.projects.value().map((project) => [project.id, project.name])),
  );
  private readonly categories = computed(() =>
    [...new Set(this.transactions.value().map((t) => t.category))].sort(),
  );

  shiftMonth(delta: number): void {
    this.month.update((month) => shiftMonth(month, delta));
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
        currency: this.transactions.value()[0]?.currency ?? DEFAULT_CURRENCY,
        // If a project wallet is open, a new record goes straight into it.
        projectId: scope && scope !== 'personal' ? scope : null,
      },
    };
  }

  protected transactionIcon(t: Transaction): string {
    if (t.costSourceId) {
      return 'cloud_sync';
    }
    if (t.recurringPaymentId) {
      return 'autorenew';
    }
    return t.kind === 'income' ? 'south_west' : 'north_east';
  }

  protected reloadTransactions(): void {
    this.transactions.reload();
    this.summary.reload();
  }
}
