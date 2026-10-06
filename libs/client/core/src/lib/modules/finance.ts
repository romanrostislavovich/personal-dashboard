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
  /** What the subscriptions cost together, and charges that look like ones. */
  subscriptions: () => apiRequest(`${BASE}/subscriptions`),
  goals: () => apiRequest(`${BASE}/goals`),
  goalContributions: (id: string) => apiRequest(`${BASE}/goals/${id}/contributions`),
  wishlist: () => apiRequest(`${BASE}/wishlist`),
  /** The price of a wish day by day. */
  wishPrices: (id: string) => apiRequest(`${BASE}/wishlist/${id}/prices`),
  /** The AI's kept review of a month (`YYYY-MM`): `{ report: null }` — not written yet. */
  report: (month: string) => apiRequest(`${BASE}/reports`, { month }),
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
    /** The photo of a transaction's receipt, for an object URL. */
    receipt: (id: string) => api.blob(`${BASE}/transactions/${id}/receipt`),
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

    /** "Not a subscription": the charge is not suggested again. */
    dismissSubscription: (key: string) => api.post<void>(`${BASE}/subscriptions/dismiss`, { key }),
    saveGoal: (input: SavingsGoalInput, id?: string) =>
      id
        ? api.put<SavingsGoal>(`${BASE}/goals/${id}`, input)
        : api.post<SavingsGoal>(`${BASE}/goals`, input),
    removeGoal: (id: string) => api.delete(`${BASE}/goals/${id}`),
    /** Money added to a goal by hand (negative — taken out). */
    contribute: (id: string, input: GoalContribution) =>
      api.post<SavingsGoal>(`${BASE}/goals/${id}/contributions`, input),
    removeContribution: (goalId: string, id: string) =>
      api.delete(`${BASE}/goals/${goalId}/contributions/${id}`),
    /** A new wish reads its page in the shop: the name, the picture and the first price. */
    saveWish: (input: WishInput, id?: string) =>
      id
        ? api.put<Wish>(`${BASE}/wishlist/${id}`, input)
        : api.post<Wish>(`${BASE}/wishlist`, input),
    removeWish: (id: string) => api.delete(`${BASE}/wishlist/${id}`),
    /** Reads the price again without waiting for the morning. */
    checkWish: (id: string) => api.post<Wish>(`${BASE}/wishlist/${id}/check`, {}),
    setWishBought: (id: string, bought: boolean) =>
      api.put<Wish>(`${BASE}/wishlist/${id}/bought`, { bought }),
    /** Writes (or writes again) the AI's review of a month. */
    writeReport: (month: string) =>
      api.post<{ report: FinanceReport | null }>(`${BASE}/reports`, { month }),
  };
}

export type FinanceClient = ReturnType<typeof financeApi>;
