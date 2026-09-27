import { z } from 'zod';
import { LocalDate } from './local-date';

export const TRANSACTION_KINDS = ['income', 'expense'] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

const money = {
  amount: z.number().positive().max(1_000_000_000),
  /** ISO 4217: EUR, USD, PLN, … */
  currency: z.string().trim().length(3).toUpperCase(),
};

export const transactionInputSchema = z.object({
  kind: z.enum(TRANSACTION_KINDS),
  ...money,
  category: z.string().trim().min(1).max(50),
  note: z.string().max(500).nullish(),
  occurredOn: z.iso.date(),
  /** null — a personal transaction. */
  projectId: z.uuid().nullish(),
});
export type TransactionInput = z.infer<typeof transactionInputSchema>;

export interface Transaction {
  id: string;
  kind: TransactionKind;
  amount: number;
  currency: string;
  category: string;
  note: string | null;
  occurredOn: LocalDate;
  projectId: string | null;
  /** Set if the transaction was created automatically from a recurring payment. */
  recurringPaymentId: string | null;
  /** Set if the transaction is a monthly amount imported from a cost source (Hetzner, DeepSeek…). */
  costSourceId: string | null;
}

export const transactionQuerySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  /**
   * "Wallet": `personal` — only personal transactions (without a project),
   * uuid — transactions of a specific project, empty — all.
   */
  scope: z.union([z.literal('personal'), z.uuid()]).optional(),
});
export type TransactionQuery = z.infer<typeof transactionQuerySchema>;

/**
 * A recurring payment: a server, a domain, a subscription. Once a month on the given day
 * it automatically turns into an expense transaction and sends a notification.
 */
export const recurringPaymentInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  ...money,
  category: z.string().trim().min(1).max(50),
  /** Day of the month to charge; 31 in a short month = the last day. */
  dayOfMonth: z.number().int().min(1).max(31),
  projectId: z.uuid().nullish(),
  isActive: z.boolean().default(true),
});
export type RecurringPaymentInput = z.input<typeof recurringPaymentInputSchema>;

export interface RecurringPayment {
  id: string;
  name: string;
  amount: number;
  currency: string;
  category: string;
  dayOfMonth: number;
  projectId: string | null;
  isActive: boolean;
  lastChargedOn: LocalDate | null;
}

export interface CurrencyTotals {
  currency: string;
  income: number;
  expense: number;
  balance: number;
}

export interface CategoryTotal {
  category: string;
  currency: string;
  expense: number;
}

export interface FinanceSummary {
  from: LocalDate;
  to: LocalDate;
  /** Amounts are not converted between currencies — one row per currency. */
  totals: CurrencyTotals[];
  topExpenseCategories: CategoryTotal[];
}

/**
 * Sources of automatic cost import. Each one updates, once a day,
 * a single expense transaction for the current month.
 */
export const COST_PROVIDERS = ['hetzner', 'deepseek'] as const;
export type CostProvider = (typeof COST_PROVIDERS)[number];

export const costSourceInputSchema = z.object({
  provider: z.enum(COST_PROVIDERS),
  name: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(50),
  /** Project wallet; null — personal costs. */
  projectId: z.uuid().nullish(),
  /** The service API token; stored encrypted and never returned. */
  apiToken: z.string().trim().min(10),
});
export type CostSourceInput = z.infer<typeof costSourceInputSchema>;

export interface CostSource {
  id: string;
  provider: CostProvider;
  name: string;
  category: string;
  projectId: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  /** Imported for the current month. */
  currentMonth: { amount: number; currency: string } | null;
}
