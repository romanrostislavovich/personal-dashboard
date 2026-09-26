import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  FinanceSummary,
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

  // --- Реактивные чтения: перезапрашиваются сами, когда меняется query() ---

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

  recurringPayments() {
    return httpResource<RecurringPayment[]>(() => `${BASE}/recurring-payments`, {
      defaultValue: [],
    });
  }

  // --- Изменения ---

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
}

function toParams({ from, to, scope }: TransactionQuery): Record<string, string> {
  return scope ? { from, to, scope } : { from, to };
}
