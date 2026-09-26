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
  /** null — личная операция. */
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
  /** Если операция создана автоматически из регулярного платежа. */
  recurringPaymentId: string | null;
  /** Если операция — месячная сумма, импортированная из источника затрат (Hetzner, DeepSeek…). */
  costSourceId: string | null;
}

export const transactionQuerySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  /**
   * «Кошелёк»: `personal` — только личные операции (без проекта),
   * uuid — операции конкретного проекта, пусто — все.
   */
  scope: z.union([z.literal('personal'), z.uuid()]).optional(),
});
export type TransactionQuery = z.infer<typeof transactionQuerySchema>;

/**
 * Регулярный платёж: сервер, домен, подписка. Раз в месяц в указанный день
 * автоматически превращается в операцию-расход и присылает уведомление.
 */
export const recurringPaymentInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  ...money,
  category: z.string().trim().min(1).max(50),
  /** День месяца списания; 31 в коротком месяце = последний день. */
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
  /** Суммы не конвертируются между валютами — по строке на каждую валюту. */
  totals: CurrencyTotals[];
  topExpenseCategories: CategoryTotal[];
}

/**
 * Источники автоматического импорта затрат. Каждый раз в день обновляет
 * одну операцию-расход за текущий месяц.
 */
export const COST_PROVIDERS = ['hetzner', 'deepseek'] as const;
export type CostProvider = (typeof COST_PROVIDERS)[number];

export const costSourceInputSchema = z.object({
  provider: z.enum(COST_PROVIDERS),
  name: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(50),
  /** Кошелёк проекта; null — личные затраты. */
  projectId: z.uuid().nullish(),
  /** API-токен сервиса; хранится зашифрованным и обратно не отдаётся. */
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
  /** Импортировано за текущий месяц. */
  currentMonth: { amount: number; currency: string } | null;
}
