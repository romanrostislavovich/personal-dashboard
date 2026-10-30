import {
  Asset,
  AssetInput,
  BankAppInput,
  BankConnectInput,
  BankOption,
  BankState,
  BankResortResult,
  BankSyncResult,
  Budget,
  BudgetInput,
  CostSource,
  CostSourceInput,
  ContractLetter,
  ContractLetterInput,
  FinanceReport,
  FinanceSettings,
  FinanceSettingsInput,
  KeyDate,
  NetWorth,
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
  CategoryModelState,
  CategorySuggestion,
  TransactionKind,
} from '@pd/contracts';
import {ApiClient, apiRequest} from '../api-client';

const BASE = '/api/finance';

/** Read requests of finance (see ApiRequest). */
export const FINANCE_READS = {
  transactions: ({from, to, scope}: TransactionQuery) =>
    apiRequest(`${BASE}/transactions`, {from, to, scope: scope || undefined}),
  summary: ({from, to, scope}: TransactionQuery) =>
    apiRequest(`${BASE}/summary`, {from, to, scope: scope || undefined}),
  /** Income and expenses per month and currency — the chart and month-over-month deltas. */
  cashFlow: ({from, to, scope}: TransactionQuery) =>
    apiRequest(`${BASE}/cash-flow`, {from, to, scope: scope || undefined}),
  /** The same months with everything converted into the main currency. */
  cashFlowInMain: ({from, to, scope}: TransactionQuery) =>
    apiRequest(`${BASE}/cash-flow/main`, {from, to, scope: scope || undefined}),
  settings: () => apiRequest(`${BASE}/settings`),
  recurringPayments: () => apiRequest(`${BASE}/recurring-payments`),
  /** Notice deadlines, ends of terms and price locks, renewals: a year ahead. */
  keyDates: () => apiRequest(`${BASE}/recurring-payments/dates`),
  /** Net worth, the burn rate and the runway. */
  worth: () => apiRequest(`${BASE}/worth`),
  /** How good the user's own category model is. */
  categoryModel: () => apiRequest(`${BASE}/category-model`),
  assets: () => apiRequest(`${BASE}/assets`),
  costSources: () => apiRequest(`${BASE}/cost-sources`),
  /** The budgets with what was spent in a month (`YYYY-MM`). */
  budgets: (month: string) => apiRequest(`${BASE}/budgets`, {month}),
  /** What the subscriptions cost together, and charges that look like ones. */
  subscriptions: () => apiRequest(`${BASE}/subscriptions`),
  wishlist: () => apiRequest(`${BASE}/wishlist`),
  /** The price of a wish day by day. */
  wishPrices: (id: string) => apiRequest(`${BASE}/wishlist/${id}/prices`),
  /** The AI's kept review of a month (`YYYY-MM`): `{ report: null }` — not written yet. */
  report: (month: string) => apiRequest(`${BASE}/reports`, {month}),
  /** The bank directly (open banking): the owner's application, the user's connections. */
  bank: () => apiRequest(`${BASE}/bank`),
  bankBanks: (country: string) => apiRequest(`${BASE}/bank/banks`, {country}),
};

export function financeApi(api: ApiClient) {
  return {
    bank: () => api.read<BankState>(FINANCE_READS.bank()),
    bankBanks: (country: string) =>
      api.read<BankOption[]>(FINANCE_READS.bankBanks(country)),
    /** The owner's application at Enable Banking: checked with it before it is kept. */
    setBankApp: (input: BankAppInput) =>
      api.put<void>(`${BASE}/bank/app`, input),
    removeBankApp: () => api.delete(`${BASE}/bank/app`),
    /** The bank's sign-in page: the browser goes there and comes back to the callback. */
    connectBank: (input: BankConnectInput) =>
      api.post<{url: string}>(`${BASE}/bank/connect`, input),
    setBankAccount: (id: string, enabled: boolean) =>
      api.put<void>(`${BASE}/bank/accounts/${id}`, {enabled}),
    syncBank: (id: string) =>
      api.post<BankSyncResult>(`${BASE}/bank/connections/${id}/sync`, {}),
    removeBank: (id: string) => api.delete(`${BASE}/bank/connections/${id}`),
    /** The bank's transactions still uncategorized, sorted again. */
    resortBank: () => api.post<BankResortResult>(`${BASE}/bank/resort`, {}),
    /** A history exported from iPKO (CSV or XML): its operations as transactions, once. */
    importStatement: (file: Blob, name: string) => {
      const form = new FormData();
      form.append('file', file, name);
      return api.post<BankSyncResult>(`${BASE}/bank/statement`, form);
    },
    transactions: (query: TransactionQuery) =>
      api.read<Transaction[]>(FINANCE_READS.transactions(query)),
    summary: (query: TransactionQuery) =>
      api.read<FinanceSummary>(FINANCE_READS.summary(query)),
    cashFlow: (query: TransactionQuery) =>
      api.read<MonthCashFlow[]>(FINANCE_READS.cashFlow(query)),
    cashFlowInMain: (query: TransactionQuery) =>
      api.read<MainCashFlow>(FINANCE_READS.cashFlowInMain(query)),
    budgets: (month: string) =>
      api.read<Budget[]>(FINANCE_READS.budgets(month)),
    /** The photo of a transaction's receipt, for an object URL. */
    receipt: (id: string) => api.blob(`${BASE}/transactions/${id}/receipt`),
    /** The whole set of budgets at once. */
    saveBudgets: (budgets: BudgetInput[]) =>
      api.put<void>(`${BASE}/budgets`, {budgets}),
    settings: () => api.read<FinanceSettings>(FINANCE_READS.settings()),
    /** `mainCurrency: null` — the currency used most. */
    saveSettings: (input: FinanceSettingsInput) =>
      api.put<FinanceSettings>(`${BASE}/settings`, input),
    recurringPayments: () =>
      api.read<RecurringPayment[]>(FINANCE_READS.recurringPayments()),
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
    removeRecurringPayment: (id: string) =>
      api.delete(`${BASE}/recurring-payments/${id}`),
    addCostSource: (input: CostSourceInput) =>
      api.post<void>(`${BASE}/cost-sources`, input),
    syncCostSource: (id: string) =>
      api.post<void>(`${BASE}/cost-sources/${id}/sync`, {}),
    removeCostSource: (id: string) => api.delete(`${BASE}/cost-sources/${id}`),

    /** "Not a subscription": the charge is not suggested again. */
    dismissSubscription: (key: string) =>
      api.post<void>(`${BASE}/subscriptions/dismiss`, {key}),
    keyDates: () => api.read<KeyDate[]>(FINANCE_READS.keyDates()),
    /** A letter to end a contract or to ask for a better price, drafted by the AI. */
    contractLetter: (id: string, input: ContractLetterInput) =>
      api.post<ContractLetter>(
        `${BASE}/recurring-payments/${id}/letter`,
        input,
      ),
    wishlist: () => api.read<Wish[]>(FINANCE_READS.wishlist()),
    worth: () => api.read<NetWorth>(FINANCE_READS.worth()),
    categoryModel: () =>
      api.read<CategoryModelState>(FINANCE_READS.categoryModel()),
    /** The category the model is sure of for a transaction being typed in; null — not sure. */
    suggestCategory: (kind: TransactionKind, text: string, amount: number) =>
      api.get<CategorySuggestion | null>(
        `${BASE}/category-suggest?kind=${kind}&text=${encodeURIComponent(text)}&amount=${amount}`,
      ),
    assets: () => api.read<Asset[]>(FINANCE_READS.assets()),
    saveAsset: (input: AssetInput, id?: string) =>
      id
        ? api.put<Asset>(`${BASE}/assets/${id}`, input)
        : api.post<Asset>(`${BASE}/assets`, input),
    removeAsset: (id: string) => api.delete(`${BASE}/assets/${id}`),
    /** A new wish reads its page in the shop: the name, the picture and the first price. */
    saveWish: (input: WishInput, id?: string) =>
      id
        ? api.put<Wish>(`${BASE}/wishlist/${id}`, input)
        : api.post<Wish>(`${BASE}/wishlist`, input),
    removeWish: (id: string) => api.delete(`${BASE}/wishlist/${id}`),
    /** Reads the price again without waiting for the morning. */
    checkWish: (id: string) =>
      api.post<Wish>(`${BASE}/wishlist/${id}/check`, {}),
    /** `record` — the purchase also becomes an expense of today. */
    setWishBought: (id: string, bought: boolean, record = false) =>
      api.put<Wish>(`${BASE}/wishlist/${id}/bought`, {bought, record}),
    /** Writes (or writes again) the AI's review of a month. */
    writeReport: (month: string) =>
      api.post<{report: FinanceReport | null}>(`${BASE}/reports`, {month}),
  };
}
