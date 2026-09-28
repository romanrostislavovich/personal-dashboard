import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  CostSource,
  CostSourceInput,
  FinanceSummary,
  MonthCashFlow,
  RecurringPayment,
  RecurringPaymentInput,
  Transaction,
  TransactionInput,
  TransactionQuery,
} from '@pd/contracts';

const BASE = '/api/finance';

@Injectable({ providedIn: 'root' })
export class FinanceApi {
  private readonly http = inject(HttpClient);

  // --- Reactive reads: re-fetched automatically when query() changes ---

  transactions(query: () => TransactionQuery) {
    return httpResource<Transaction[]>(
      () => ({ url: `${BASE}/transactions`, params: toParams(query()) }),
      {
        defaultValue: [],
      },
    );
  }

  summary(query: () => TransactionQuery) {
    return httpResource<FinanceSummary>(() => ({
      url: `${BASE}/summary`,
      params: toParams(query()),
    }));
  }

  /** Income and expenses per month and currency — for the chart and month-over-month deltas. */
  cashFlow(query: () => TransactionQuery) {
    return httpResource<MonthCashFlow[]>(
      () => ({ url: `${BASE}/cash-flow`, params: toParams(query()) }),
      { defaultValue: [] },
    );
  }

  recurringPayments() {
    return httpResource<RecurringPayment[]>(() => `${BASE}/recurring-payments`, {
      defaultValue: [],
    });
  }

  // --- Mutations ---

  saveTransaction(input: TransactionInput, id?: string) {
    return id
      ? this.http.put<Transaction>(`${BASE}/transactions/${id}`, input)
      : this.http.post<Transaction>(`${BASE}/transactions`, input);
  }

  removeTransaction(id: string) {
    return this.http.delete<void>(`${BASE}/transactions/${id}`);
  }

  saveRecurringPayment(input: RecurringPaymentInput, id?: string) {
    return id
      ? this.http.put<RecurringPayment>(`${BASE}/recurring-payments/${id}`, input)
      : this.http.post<RecurringPayment>(`${BASE}/recurring-payments`, input);
  }

  removeRecurringPayment(id: string) {
    return this.http.delete<void>(`${BASE}/recurring-payments/${id}`);
  }

  // --- Automatic cost import ---

  costSources() {
    return httpResource<CostSource[]>(() => `${BASE}/cost-sources`, { defaultValue: [] });
  }

  addCostSource(input: CostSourceInput) {
    return this.http.post<void>(`${BASE}/cost-sources`, input);
  }

  syncCostSource(id: string) {
    return this.http.post<void>(`${BASE}/cost-sources/${id}/sync`, {});
  }

  removeCostSource(id: string) {
    return this.http.delete<void>(`${BASE}/cost-sources/${id}`);
  }
}

function toParams({ from, to, scope }: TransactionQuery): Record<string, string> {
  return scope ? { from, to, scope } : { from, to };
}
