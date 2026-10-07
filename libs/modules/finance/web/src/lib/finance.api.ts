import { httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { FINANCE_READS, financeApi } from '@pd/client-core';
import {
  Budget,
  BudgetInput,
  CostSource,
  CostSourceInput,
  FinanceReport,
  FinanceSettings,
  FinanceSettingsInput,
  GoalContribution,
  SavingsGoal,
  SavingsGoalInput,
  Subscriptions,
  FinanceSummary,
  MainCashFlow,
  MonthCashFlow,
  RecurringPayment,
  RecurringPaymentInput,
  Transaction,
  TransactionInput,
  TransactionQuery,
  Wish,
  WishInput,
  WishPricePoint,
} from '@pd/contracts';
import { DASHBOARD_CLIENT, fromCore } from '@pd/web-core';

/** The finance requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({ providedIn: 'root' })
export class FinanceApi {
  private readonly finance = financeApi(inject(DASHBOARD_CLIENT).api);

  // --- Reactive reads: re-fetched automatically when query() changes ---

  transactions(query: () => TransactionQuery) {
    return httpResource<Transaction[]>(() => FINANCE_READS.transactions(query()), {
      defaultValue: [],
    });
  }

  summary(query: () => TransactionQuery) {
    return httpResource<FinanceSummary>(() => FINANCE_READS.summary(query()));
  }

  /** Income and expenses per month and currency — for the chart and month-over-month deltas. */
  cashFlow(query: () => TransactionQuery) {
    return httpResource<MonthCashFlow[]>(() => FINANCE_READS.cashFlow(query()), {
      defaultValue: [],
    });
  }

  /** Everything converted into the main currency (see FinanceConversion). */
  cashFlowInMain(query: () => TransactionQuery) {
    return httpResource<MainCashFlow>(() => FINANCE_READS.cashFlowInMain(query()));
  }

  settings() {
    return httpResource<FinanceSettings>(() => FINANCE_READS.settings());
  }

  saveSettings(input: FinanceSettingsInput) {
    return fromCore(() => this.finance.saveSettings(input));
  }

  recurringPayments() {
    return httpResource<RecurringPayment[]>(() => FINANCE_READS.recurringPayments(), {
      defaultValue: [],
    });
  }

  // --- Mutations ---

  saveTransaction(input: TransactionInput, id?: string) {
    return fromCore(() => this.finance.saveTransaction(input, id));
  }

  removeTransaction(id: string) {
    return fromCore(() => this.finance.removeTransaction(id));
  }

  saveRecurringPayment(input: RecurringPaymentInput, id?: string) {
    return fromCore(() => this.finance.saveRecurringPayment(input, id));
  }

  removeRecurringPayment(id: string) {
    return fromCore(() => this.finance.removeRecurringPayment(id));
  }

  // --- Automatic cost import ---

  costSources() {
    return httpResource<CostSource[]>(() => FINANCE_READS.costSources(), { defaultValue: [] });
  }

  addCostSource(input: CostSourceInput) {
    return fromCore(() => this.finance.addCostSource(input));
  }

  syncCostSource(id: string) {
    return fromCore(() => this.finance.syncCostSource(id));
  }

  removeCostSource(id: string) {
    return fromCore(() => this.finance.removeCostSource(id));
  }

  budgets(month: () => string) {
    return httpResource<Budget[]>(() => FINANCE_READS.budgets(month()), { defaultValue: [] });
  }

  saveBudgets(budgets: BudgetInput[]) {
    return fromCore(() => this.finance.saveBudgets(budgets));
  }

  // --- Subscriptions, savings goals, the AI's review ---

  subscriptions() {
    return httpResource<Subscriptions>(() => FINANCE_READS.subscriptions());
  }

  dismissSubscription(key: string) {
    return fromCore(() => this.finance.dismissSubscription(key));
  }

  goals() {
    return httpResource<SavingsGoal[]>(() => FINANCE_READS.goals(), { defaultValue: [] });
  }

  goalContributions(id: () => string | null) {
    return httpResource<{ id: string; amount: number; note: string | null; occurredOn: string }[]>(
      () => {
        const goal = id();
        return goal ? FINANCE_READS.goalContributions(goal) : undefined;
      },
      { defaultValue: [] },
    );
  }

  saveGoal(input: SavingsGoalInput, id?: string) {
    return fromCore(() => this.finance.saveGoal(input, id));
  }

  removeGoal(id: string) {
    return fromCore(() => this.finance.removeGoal(id));
  }

  contribute(id: string, input: GoalContribution) {
    return fromCore(() => this.finance.contribute(id, input));
  }

  removeContribution(goalId: string, id: string) {
    return fromCore(() => this.finance.removeContribution(goalId, id));
  }

  report(month: () => string) {
    return httpResource<{ report: FinanceReport | null }>(() => FINANCE_READS.report(month()));
  }

  writeReport(month: string) {
    return fromCore(() => this.finance.writeReport(month));
  }

  // --- Wishlist ---

  wishlist() {
    return httpResource<Wish[]>(() => FINANCE_READS.wishlist(), { defaultValue: [] });
  }

  wishPrices(id: () => string | null) {
    return httpResource<WishPricePoint[]>(
      () => {
        const wish = id();
        return wish ? FINANCE_READS.wishPrices(wish) : undefined;
      },
      { defaultValue: [] },
    );
  }

  saveWish(input: WishInput, id?: string) {
    return fromCore(() => this.finance.saveWish(input, id));
  }

  removeWish(id: string) {
    return fromCore(() => this.finance.removeWish(id));
  }

  checkWish(id: string) {
    return fromCore(() => this.finance.checkWish(id));
  }

  setWishBought(id: string, bought: boolean, record = false) {
    return fromCore(() => this.finance.setWishBought(id, bought, record));
  }

  /** Opens the photo of a transaction's receipt in a new tab. */
  async openReceipt(id: string): Promise<void> {
    const blob = await this.finance.receipt(id);
    window.open(URL.createObjectURL(blob), '_blank');
  }
}
