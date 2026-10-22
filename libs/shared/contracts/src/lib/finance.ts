import { z } from 'zod';
import { ServiceUsage } from './links';
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

/** The user's own category model (trained on their transactions): how good it is, per kind. */
export interface CategoryModelState {
  trainedAt: string;
  kinds: {
    kind: TransactionKind;
    examples: number;
    categories: number;
    /** Right on the first guess, for counterparties it never saw. */
    accuracy: number;
    /** The share it is sure of, and how often it is right on those. */
    sureShare: number;
    sureAccuracy: number;
    /** It sorts a bank import's new counterparties on its own (else the AI is asked). */
    trusted: boolean;
  }[];
}

/** The category the model is sure of, for a transaction being typed in. */
export interface CategorySuggestion {
  category: string;
  probability: number;
  trusted: boolean;
}

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
  /** A photo of its receipt is kept (`GET /api/finance/transactions/:id/receipt`). */
  hasReceipt: boolean;
  /**
   * The amount in the main currency at the rate of its day (see FinanceConversion); `null` — no
   * rate for this currency.
   */
  mainAmount: number | null;
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
export const RECURRING_PERIODS = ['month', 'year'] as const;
export type RecurringPeriod = (typeof RECURRING_PERIODS)[number];

/**
 * The terms of a contract behind a payment (rent, the internet, insurance), all optional: from
 * them the end of the term and the last day to give notice are counted.
 */
const contractTerms = {
  /** The day the contract began; empty — the first charge seen in the transactions. */
  contractStartedOn: z.iso.date().nullish(),
  /** How long one term lasts, in months (12, 24); empty — no fixed term. */
  contractMonths: z.number().int().min(1).max(120).nullish(),
  /** How many days before the end of a term the notice must be given. */
  noticeDays: z.number().int().min(0).max(365).nullish(),
  /** The term starts again by itself unless notice is given. */
  autoRenews: z.boolean().default(true),
  /** The price is fixed until this day (a promotion, a price lock). */
  priceLockedUntil: z.iso.date().nullish(),
};

export const recurringPaymentInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    ...money,
    category: z.string().trim().min(1).max(50),
    /** Day of the month to charge; 31 in a short month = the last day. */
    dayOfMonth: z.number().int().min(1).max(31),
    /** Every month, or once a year in `monthOfYear`. */
    period: z.enum(RECURRING_PERIODS).default('month'),
    /** 1–12: the month of a yearly charge. */
    monthOfYear: z.number().int().min(1).max(12).nullish(),
    /** The free trial ends this day: nothing is charged before it, a reminder comes 3 days ahead. */
    trialEndsOn: z.iso.date().nullish(),
    projectId: z.uuid().nullish(),
    isActive: z.boolean().default(true),
    ...contractTerms,
  })
  .refine((input) => input.period !== 'year' || input.monthOfYear, {
    message: 'A yearly payment needs its month',
    path: ['monthOfYear'],
  });
export type RecurringPaymentInput = z.input<typeof recurringPaymentInputSchema>;

export interface RecurringPayment {
  id: string;
  name: string;
  amount: number;
  currency: string;
  category: string;
  dayOfMonth: number;
  period: RecurringPeriod;
  monthOfYear: number | null;
  trialEndsOn: LocalDate | null;
  projectId: string | null;
  isActive: boolean;
  lastChargedOn: LocalDate | null;
  /** The earlier prices, the newest first. */
  priceHistory: { amount: number; changedOn: LocalDate }[];
  contractStartedOn: LocalDate | null;
  contractMonths: number | null;
  noticeDays: number | null;
  autoRenews: boolean;
  priceLockedUntil: LocalDate | null;
  /** The dates counted from the terms; `null` — no term given. */
  contract: ContractDates | null;
}

/** What the terms of a contract come to today. */
export interface ContractDates {
  startedOn: LocalDate;
  /** The start was not given: it is the first charge seen in the transactions. */
  startGuessed: boolean;
  /** The end of the current term (the one running today). */
  termEndsOn: LocalDate;
  /** The last day to give notice so the contract ends with this term. */
  cancelBy: LocalDate;
  /** The day to give notice has passed: the next chance is the end of the next term. */
  tooLate: boolean;
}

/** A date of the payments worth knowing in advance, for the calendar of key dates. */
export const KEY_DATE_KINDS = ['cancel-by', 'term-end', 'price-lock', 'trial', 'renewal'] as const;
export type KeyDateKind = (typeof KEY_DATE_KINDS)[number];

export interface KeyDate {
  paymentId: string;
  name: string;
  kind: KeyDateKind;
  date: LocalDate;
  amount: number;
  currency: string;
}

/** A letter about a contract the AI drafts: to end it or to ask for a better price. */
export const CONTRACT_LETTER_KINDS = ['cancel', 'renegotiate'] as const;
export const CONTRACT_LETTER_LANGUAGES = ['en', 'pl'] as const;
export const contractLetterInputSchema = z.object({
  kind: z.enum(CONTRACT_LETTER_KINDS),
  language: z.enum(CONTRACT_LETTER_LANGUAGES),
  /** The sender's name, the customer number — whatever the letter should carry. */
  details: z.string().trim().max(500).nullish(),
});
export type ContractLetterInput = z.infer<typeof contractLetterInputSchema>;

export interface ContractLetter {
  subject: string;
  body: string;
  /** Written by the AI; `false` — a plain template (no AI connected). */
  byAi: boolean;
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
  /** As they are, one row per currency. */
  totals: CurrencyTotals[];
  topExpenseCategories: CategoryTotal[];
  /** Everything converted into the main currency; `null` without transactions. */
  inMain: MainCurrencyTotals | null;
}

/**
 * How amounts were converted into the main currency. Rates are the European Central Bank's for
 * the day of each transaction (through Frankfurter); a currency the ECB does not publish is
 * converted at today's rate (`approximate`); one without any rate is left out (`missing`).
 */
export interface FinanceConversion {
  mainCurrency: string;
  approximate: string[];
  missing: string[];
}

export interface MainCurrencyTotals extends FinanceConversion {
  income: number;
  expense: number;
  balance: number;
  topExpenseCategories: { category: string; expense: number }[];
}

/** `GET /api/finance/cash-flow/main`: months in the main currency, and how they were converted. */
export interface MainCashFlow extends FinanceConversion {
  months: { month: string; income: number; expense: number }[];
}

/** An ISO 4217 code: `EUR`, `PLN`. */
const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Expected a currency code like EUR');

export const financeSettingsSchema = z.object({
  /** `null` — the currency used most. */
  mainCurrency: currencyCodeSchema.nullable(),
});
export type FinanceSettingsInput = z.infer<typeof financeSettingsSchema>;

export interface FinanceSettings {
  /** As chosen; `null` — automatic. */
  mainCurrency: string | null;
  /** The one in use: the chosen one or the most used. */
  effectiveMainCurrency: string;
  /** Currencies with daily ECB rates — the ones converted exactly. */
  supportedCurrencies: string[];
}

/** Income and expenses of one month in one currency — for the cash flow chart. */
export interface MonthCashFlow {
  /** `YYYY-MM` */
  month: string;
  currency: string;
  income: number;
  expense: number;
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

// --- Budgets ---

/** The category of a budget for all expenses of the month together. */
export const BUDGET_TOTAL = '*';

/** A monthly limit of a category (or of all expenses, `BUDGET_TOTAL`), in the main currency. */
export const budgetInputSchema = z.object({
  category: z.string().trim().min(1).max(50),
  limit: z.number().positive().max(1_000_000_000),
});
export type BudgetInput = z.infer<typeof budgetInputSchema>;

/** `PUT /api/finance/budgets`: the whole set at once. */
export const budgetsSchema = z.object({ budgets: z.array(budgetInputSchema).max(100) });
export type Budgets = z.infer<typeof budgetsSchema>;

export interface Budget extends BudgetInput {
  id: string;
  /** Spent in the month, in the main currency. */
  spent: number;
  currency: string;
}

export const budgetQuerySchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });
export type BudgetQuery = z.infer<typeof budgetQuerySchema>;

const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

// --- Subscriptions ---

/** A charge that repeats month after month in the transactions but is not a recurring payment. */
export interface SubscriptionSuggestion {
  /** What it is recognised by (the note, lower case); "not a subscription" remembers it. */
  key: string;
  name: string;
  amount: number;
  currency: string;
  category: string;
  dayOfMonth: number;
  /** The months (`YYYY-MM`) it was charged in. */
  months: string[];
}

/** The recurring payments as subscriptions: what they cost together and what may be one. */
export interface Subscriptions {
  currency: string;
  /** The active ones in the main currency, a yearly one counted as a twelfth a month. */
  perMonth: number;
  perYear: number;
  suggestions: SubscriptionSuggestion[];
  /**
   * The active payments some section knows the use of (music — the plays, activity — the time
   * in the program, games — the play time), over the last `usageDays`.
   */
  usage: SubscriptionUse[];
  usageDays: number;
  /** Where money leaks: rising prices, double charges, unused or unrecorded subscriptions. */
  leaks: SubscriptionLeak[];
  /** What the leaks cost a year together, in the main currency. */
  leaksPerYear: number;
}

export const LEAK_KINDS = ['rising', 'double', 'unused', 'hidden', 'renewal'] as const;
export type LeakKind = (typeof LEAK_KINDS)[number];

/**
 * One leak: `rising` — the price crept up over the year; `double` — charged twice in a month;
 * `unused` — paid for and not used; `hidden` — a repeating charge never recorded; `renewal` — a
 * yearly charge or the end of a term is near.
 */
export interface SubscriptionLeak {
  kind: LeakKind;
  name: string;
  /** The recorded payment it is about; `null` — a charge seen in the bank only. */
  paymentId: string | null;
  /** The charge's key for `hidden` (to add it or say it is not a subscription). */
  key: string | null;
  amount: number;
  currency: string;
  /** `rising`: the price a year ago (or at the first charge seen). */
  previous: number | null;
  /** `rising`: since when; `double`: the month; `renewal`: the day. */
  date: LocalDate | null;
  /** What it costs a year, in the main currency; `null` — no rate. */
  perYear: number | null;
}

/** A payment against how much what it pays for was used. */
export interface SubscriptionUse {
  id: string;
  name: string;
  amount: number;
  currency: string;
  uses: ServiceUsage[];
  /** Paid for and not used once in the period. */
  unused: boolean;
}

export const subscriptionDismissSchema = z.object({ key: z.string().trim().min(1).max(200) });
export type SubscriptionDismiss = z.infer<typeof subscriptionDismissSchema>;

// --- The AI's report of a month ---

export interface FinanceReport {
  month: string;
  /** One or two sentences: goes to the summary of the month on the 1st. */
  summary: string;
  /** Markdown. */
  text: string;
  createdAt: string;
}

export const financeReportQuerySchema = z.object({ month: monthKey });
export type FinanceReportQuery = z.infer<typeof financeReportQuerySchema>;

// --- Wishlist ---

export const wishInputSchema = z.object({
  /** The product's page in a shop: its price is read from there every day. */
  url: z.url({ protocol: /^https?$/ }).max(2000),
  /** Empty — the name the page gives. */
  name: z.string().trim().max(200).nullish(),
  note: z.string().trim().max(500).nullish(),
  /** The price typed in by hand: used while the page does not tell one. */
  price: z.number().positive().max(1_000_000_000).nullish(),
  currency: z.string().trim().length(3).toUpperCase().nullish(),
  /** The product's picture, when the browser extension read it from the page. */
  imageUrl: z
    .url({ protocol: /^https?$/ })
    .max(2000)
    .nullish(),
  /** Whom it is a gift for: a name as in Birthdays, where it shows as a gift idea. */
  recipient: z.string().trim().max(100).nullish(),
});
export type WishInput = z.input<typeof wishInputSchema>;

export interface Wish {
  id: string;
  url: string;
  name: string;
  note: string | null;
  imageUrl: string | null;
  /** The last price known; `null` — never read and not typed in. */
  price: number | null;
  currency: string | null;
  /** The price before the last change; `null` — it has not changed yet. */
  previousPrice: number | null;
  /** The lowest and the highest price seen. */
  lowestPrice: number | null;
  highestPrice: number | null;
  checkedAt: string | null;
  /** Why the last check gave no price (`HTTP 403`, `no-price`); `null` — it did. */
  checkError: string | null;
  boughtAt: string | null;
  createdAt: string;
  recipient: string | null;
  /**
   * What is left of this month's budget of all expenses, and what buying the wish would leave
   * (negative — over the budget), in the main currency; `null` — no such budget or no price.
   */
  budget: { left: number; afterBuying: number; currency: string } | null;
}

/** The price of a wish on a day. */
export interface WishPricePoint {
  day: LocalDate;
  price: number;
}

export const wishBoughtSchema = z.object({
  bought: z.boolean(),
  /** Also record the purchase as an expense of today, at the wish's price. */
  record: z.boolean().optional(),
});
export type WishBought = z.infer<typeof wishBoughtSchema>;
