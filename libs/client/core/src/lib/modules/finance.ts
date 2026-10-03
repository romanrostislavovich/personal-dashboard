import {
  Budget,
  BudgetInput,
  CostSource,
  CostSourceInput,
  FinanceSettings,
  FinanceSettingsInput,
  FinanceSummary,
  MainCashFlow,
  MonthCashFlow,
  RecurringPayment,
  RecurringPaymentInput,
  Transaction,
  TransactionInput,
  TransactionQuery,
} from '@pd/contracts';
import { ApiClient, apiRequest } from '../api-client';

const BASE = '/api/finance';

/** Read requests of finance (see ApiRequest). */
export const FINANCE_READS = {
  transactions: ({ from, to, scope }: TransactionQuery) =>
    apiRequest(`${BASE}/transactions`, { from, to, scope: scope || undefined }),
  summary: ({ from, to, scope }: TransactionQuery) =>
    apiRequest(`${BASE}/summary`, { from, to, scope: scope || undefined }),
  /** Income and expenses per month and currency — the chart and month-over-month deltas. */
  cashFlow: ({ from, to, scope }: TransactionQuery) =>
    apiRequest(`${BASE}/cash-flow`, { from, to, scope: scope || undefined }),
  /** The same months with everything converted into the main currency. */
  cashFlowInMain: ({ from, to, scope }: TransactionQuery) =>
    apiRequest(`${BASE}/cash-flow/main`, { from, to, scope: scope || undefined }),
  settings: () => apiRequest(`${BASE}/settings`),
  recurringPayments: () => apiRequest(`${BASE}/recurring-payments`),
  costSources: () => apiRequest(`${BASE}/cost-sources`),
  /** The budgets with what was spent in a month (`YYYY-MM`). */
  budgets: (month: string) => apiRequest(`${BASE}/budgets`, { month }),
};

export function financeApi(api: ApiClient) {
  return {
    transactions: (query: TransactionQuery) =>
      api.read<Transaction[]>(FINANCE_READS.transactions(query)),
    summary: (query: TransactionQuery) => api.read<FinanceSummary>(FINANCE_READS.summary(query)),
    cashFlow: (query: TransactionQuery) => api.read<MonthCashFlow[]>(FINANCE_READS.cashFlow(query)),
    cashFlowInMain: (query: TransactionQuery) =>
      api.read<MainCashFlow>(FINANCE_READS.cashFlowInMain(query)),
    budgets: (month: string) => api.read<Budget[]>(FINANCE_READS.budgets(month)),
    /** The whole set of budgets at once. */
    saveBudgets: (budgets: BudgetInput[]) => api.put<void>(`${BASE}/budgets`, { budgets }),
    settings: () => api.read<FinanceSettings>(FINANCE_READS.settings()),
    /** `mainCurrency: null` — the currency used most. */
    saveSettings: (input: FinanceSettingsInput) =>
      api.put<FinanceSettings>(`${BASE}/settings`, input),
    recurringPayments: () => api.read<RecurringPayment[]>(FINANCE_READS.recurringPayments()),
    costSources: () => api.read<CostSource[]>(FINANCE_READS.costSources()),

    /** Creates, or with `id` changes, a transaction. */
    saveTransaction: (input: TransactionInput, id?: string) =>
      id
        ? api.put<Transaction>(`${BASE}/transactions/${id}`, input)
        : api.post<Transaction>(`${BASE}/transactions`, input),
    removeTransaction: (id: string) => api.delete(`${BASE}/transactions/${id}`),
    saveRecurringPayment: (input: RecurringPaymentInput, id?: string) =>
      id
        ? api.put<RecurringPayment>(`${BASE}/recurring-payments/${id}`, input)
        : api.post<RecurringPayment>(`${BASE}/recurring-payments`, input),
    removeRecurringPayment: (id: string) => api.delete(`${BASE}/recurring-payments/${id}`),
    addCostSource: (input: CostSourceInput) => api.post<void>(`${BASE}/cost-sources`, input),
    syncCostSource: (id: string) => api.post<void>(`${BASE}/cost-sources/${id}/sync`, {}),
    removeCostSource: (id: string) => api.delete(`${BASE}/cost-sources/${id}`),
  };
}

export type FinanceClient = ReturnType<typeof financeApi>;
