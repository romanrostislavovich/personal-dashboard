import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  AiService,
  ServerActions,
  changedFields,
  findById,
  idParameters,
  NO_PARAMETERS,
  PERIOD_PARAMETERS,
} from '@pd/api-core';
import {
  wishInputSchema,
  recurringPaymentInputSchema,
  Transaction,
  TRANSACTION_KINDS,
  transactionInputSchema,
  TransactionQuery,
} from '@pd/contracts';
import { z } from 'zod';
import { CostSourcesService } from './cost-sources/cost-sources.service';
import { RecurringPaymentsService } from './recurring/recurring-payments.service';
import { SubscriptionsService } from './recurring/subscriptions.service';
import { GoalsService } from './goals/goals.service';
import { TransactionsService } from './transactions/transactions.service';
import { FINANCE_ACTIONS } from './finance.server-actions';
import { WishlistService } from './wishlist/wishlist.service';
import { filterTransactions, totalsByCategory } from './transactions/transaction-report';

/** Period schema + an optional "wallet". */
const QUERY_PARAMETERS = {
  type: 'object',
  properties: {
    ...PERIOD_PARAMETERS.properties,
    scope: {
      type: 'string',
      description: '"personal" — personal only, a project id — that project only, empty — all',
    },
  },
  required: ['from', 'to'],
};

const MONEY_FIELDS = {
  amount: { type: 'number', description: 'Positive number' },
  currency: { type: 'string', description: 'ISO 4217: EUR, USD, PLN…' },
  category: { type: 'string', description: 'E.g. Food, Hosting, Salary' },
  projectId: { type: 'string', description: 'Project id; omit (or null) for personal' },
} as const;

const TRANSACTION_FIELDS = {
  kind: { type: 'string', enum: [...TRANSACTION_KINDS] },
  ...MONEY_FIELDS,
  note: { type: 'string' },
  occurredOn: { type: 'string', description: 'YYYY-MM-DD' },
} as const;

const RECURRING_FIELDS = {
  name: { type: 'string', description: 'What is paid: "Hetzner CX22", "Spotify"' },
  ...MONEY_FIELDS,
  dayOfMonth: { type: 'number', description: 'Day of the month to charge, 1–31' },
  period: { type: 'string', enum: ['month', 'year'], description: 'Every month or once a year' },
  monthOfYear: { type: 'number', description: 'For a yearly payment: its month, 1–12' },
  trialEndsOn: {
    type: 'string',
    description: 'YYYY-MM-DD: a free trial ends this day; nothing is charged before it',
  },
  isActive: { type: 'boolean', description: 'false — paused' },
} as const;

/** What narrows the transactions of a period, on top of the period and the wallet. */
const FILTER_PARAMETERS = {
  kind: { type: 'string', enum: [...TRANSACTION_KINDS] },
  category: { type: 'string', description: 'Only this category (the case does not matter)' },
  search: {
    type: 'string',
    description: 'A part of the comment or of the category: a shop, a service ("zabka", "taxi")',
  },
} as const;

const filterArgs = z.object({
  kind: z.enum(TRANSACTION_KINDS).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(200).default(60),
});

/** Transaction ids come from the model: check the format before querying the database. */
const idArgs = z.object({ id: z.uuid() });

/** Enough for a month of an active card; a longer statement is split into several calls. */
const MAX_BATCH = 500;
const batchArgs = z.object({
  transactions: z
    .array(transactionInputSchema)
    .min(1)
    .max(MAX_BATCH, `At most ${MAX_BATCH} per call: send the rest with more calls now`),
});

/**
 * AI access to finance: totals, transactions, recurring payments and subscriptions, savings
 * goals, the wishlist, cost sources; adding, editing and deleting them (assistant).
 */
@Injectable()
export class FinanceAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly transactions: TransactionsService,
    private readonly recurring: RecurringPaymentsService,
    private readonly costSources: CostSourcesService,
    private readonly subscriptions: SubscriptionsService,
    private readonly goals: GoalsService,
    private readonly wishlist: WishlistService,
    private readonly actions: ServerActions,
  ) {}

  onModuleInit(): void {
    this.registerTransactionReadTools();
    this.registerTransactionWriteTools();
    this.registerRecurringTools();
    this.registerCostSourceTools();
    this.registerPlanningTools();
    this.registerWishlistTools();
  }

  /** The wishlist: reading it, adding a product by its link, marking one bought. */
  private registerWishlistTools(): void {
    this.ai.registerTool({
      name: 'finance_wishlist',
      module: 'finance',
      description:
        'The wishlist — products the user wants to buy: id, name, link, the current price in the ' +
        'shop, the price before the last change, the lowest and the highest seen, whether bought.',
      parameters: NO_PARAMETERS,
      handler: (userId) => this.wishlist.list(userId),
    });

    this.ai.registerTool({
      name: 'finance_add_wish',
      module: 'finance',
      writes: true,
      description:
        'Adds a product to the wishlist by the link to its page in a shop; its price is then ' +
        'read from the page every day and a change is reported. The name is taken from the page ' +
        'unless given. Pass `price` and `currency` only when the user names the price.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The link to the product page' },
          name: { type: 'string' },
          note: { type: 'string' },
          price: { type: 'number' },
          currency: { type: 'string', description: 'ISO 4217: EUR, USD, PLN…' },
        },
        required: ['url'],
      },
      handler: (userId, args) =>
        this.actions.run(userId, FINANCE_ACTIONS.addWish, wishInputSchema.parse(args)),
    });

    this.ai.registerTool({
      name: 'finance_wish_bought',
      module: 'finance',
      writes: true,
      description: 'Marks a product of the wishlist as bought: its price is not watched any more.',
      parameters: idParameters('Wish id from finance_wishlist'),
      handler: (userId, args) => this.wishlist.setBought(userId, idArgs.parse(args).id, true),
    });
  }

  /** What the subscriptions cost together and how the savings goals are going. */
  private registerPlanningTools(): void {
    this.ai.registerTool({
      name: 'finance_subscriptions',
      module: 'finance',
      description:
        'What the active recurring payments cost together a month and a year in the main ' +
        'currency, and repeating charges in the transactions that look like subscriptions.',
      parameters: NO_PARAMETERS,
      handler: (userId) => this.subscriptions.summary(userId),
    });

    this.ai.registerTool({
      name: 'finance_savings_goals',
      module: 'finance',
      description:
        'Savings goals: target, saved so far, deadline, how much to put aside a month and the ' +
        'pace so far.',
      parameters: NO_PARAMETERS,
      handler: (userId) => this.goals.list(userId),
    });
  }

  /** The summary and the list of transactions. */
  private registerTransactionReadTools(): void {
    this.ai.registerTool({
      name: 'finance_summary',
      module: 'finance',
      description:
        'Income, expenses and balance by currency for a period, and the five largest expense ' +
        'categories. For every category, or for one shop or service, use finance_categories. ' +
        'Project ids are available via core_projects.',
      parameters: QUERY_PARAMETERS,
      handler: (userId, args) => this.transactions.summary(userId, toQuery(args)),
    });

    this.ai.registerTool({
      name: 'finance_categories',
      module: 'finance',
      description:
        'What went through every category in a period, the largest first: how many ' +
        'transactions, the amount in the main currency (`mainAmount`) and as recorded per ' +
        'currency. Counted from all transactions of the period, so it is the tool for "how ' +
        'much did I spend on X": narrow it with `search` (a shop or a service in the comment: ' +
        '"zabka", "taxi") or `category`. Any period works — a month, a year, everything.',
      parameters: {
        type: 'object',
        properties: { ...QUERY_PARAMETERS.properties, ...FILTER_PARAMETERS },
        required: ['from', 'to'],
      },
      handler: async (userId, args) => {
        const found = filterTransactions(
          await this.transactions.list(userId, toQuery(args)),
          filterArgs.parse(args),
        );
        return { transactions: found.length, categories: totalsByCategory(found) };
      },
    });

    this.ai.registerTool({
      name: 'finance_transactions',
      module: 'finance',
      description:
        'The transactions of a period, newest first: id, date, income/expense, amount, ' +
        'currency, the amount in the main currency, category, note, project. A busy month has ' +
        'hundreds of them, so only `limit` (60 by default) are returned and `total` says how ' +
        'many match: narrow them with `kind`, `category` or `search` (a part of the comment). ' +
        'For sums use finance_categories — never add up a list that was cut.',
      parameters: {
        type: 'object',
        properties: {
          ...QUERY_PARAMETERS.properties,
          ...FILTER_PARAMETERS,
          limit: { type: 'number', description: '1–200, default 60' },
        },
        required: ['from', 'to'],
      },
      handler: async (userId, args) => {
        const filter = filterArgs.parse(args);
        const found = filterTransactions(
          await this.transactions.list(userId, toQuery(args)),
          filter,
        );
        return {
          total: found.length,
          shown: Math.min(found.length, filter.limit),
          transactions: found
            .slice(0, filter.limit)
            .map(
              ({
                id,
                occurredOn,
                kind,
                amount,
                currency,
                mainAmount,
                category,
                note,
                projectId,
              }) => ({
                id,
                occurredOn,
                kind,
                amount,
                currency,
                mainAmount,
                category,
                note,
                projectId,
              }),
            ),
        };
      },
    });
  }

  /** Adding, correcting and deleting transactions. */
  private registerTransactionWriteTools(): void {
    this.ai.registerTool({
      name: 'finance_add_transaction',
      module: 'finance',
      writes: true,
      description:
        "Records an income or an expense. Reuse the user's existing categories when one fits " +
        '(see finance_transactions). Only when the user names a project, put it into that ' +
        "project's wallet (projectId from core_projects); otherwise it is personal — do not ask. " +
        'Ask for the currency only if it is unclear.',
      parameters: {
        type: 'object',
        properties: TRANSACTION_FIELDS,
        required: ['kind', 'amount', 'currency', 'category', 'occurredOn'],
      },
      handler: (userId, args) =>
        this.transactions.create(userId, transactionInputSchema.parse(args)),
    });

    this.ai.registerTool({
      name: 'finance_add_transactions',
      module: 'finance',
      writes: true,
      description:
        `Records up to ${MAX_BATCH} incomes and expenses at once — for a bank statement or a ` +
        'receipt the user sent; if there are more, make several calls in the same turn. ' +
        'Before calling, load finance_transactions for the covered ' +
        'period and leave out those already recorded (same date, amount and kind). Leave out ' +
        'transfers between the own accounts and card top-ups. Put the merchant or purpose into ' +
        "note; reuse the user's existing categories. All are saved or none (an error names the " +
        'bad item). Returns how many were added and the totals.',
      parameters: {
        type: 'object',
        properties: {
          transactions: {
            type: 'array',
            items: {
              type: 'object',
              properties: TRANSACTION_FIELDS,
              required: ['kind', 'amount', 'currency', 'category', 'occurredOn'],
            },
          },
        },
        required: ['transactions'],
      },
      handler: async (userId, args) =>
        importSummary(
          await this.transactions.createMany(userId, batchArgs.parse(args).transactions),
        ),
    });

    this.ai.registerTool({
      name: 'finance_update_transaction',
      module: 'finance',
      writes: true,
      description:
        'Changes a transaction: pass its id (from finance_transactions) and only the fields ' +
        'to change.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' }, ...TRANSACTION_FIELDS },
        required: ['id'],
      },
      handler: async (userId, args) => {
        const current = await this.transactions.get(userId, idArgs.parse(args).id);
        const { kind, amount, currency, category, note, occurredOn, projectId } = current;
        const input = transactionInputSchema.parse({
          kind,
          amount,
          currency,
          category,
          note,
          occurredOn,
          projectId,
          ...changedFields(args),
        });
        return this.transactions.update(userId, current.id, input);
      },
    });

    this.ai.registerTool({
      name: 'finance_delete_transaction',
      module: 'finance',
      writes: true,
      confirm: (userId, args) => this.transactions.get(userId, idArgs.parse(args).id),
      description: 'Deletes a transaction.',
      parameters: idParameters('Transaction id from finance_transactions'),
      handler: (userId, args) => this.transactions.remove(userId, idArgs.parse(args).id),
    });
  }

  private registerRecurringTools(): void {
    const find = async (userId: string, args: Record<string, unknown>) =>
      findById(await this.recurring.list(userId), args['id'], 'Recurring payment');

    this.ai.registerTool({
      name: 'finance_recurring_payments',
      module: 'finance',
      description:
        'Recurring payments (servers, domains, subscriptions): id, amount, charge day, ' +
        'whether active.',
      parameters: NO_PARAMETERS,
      handler: (userId) => this.recurring.list(userId),
    });

    this.ai.registerTool({
      name: 'finance_add_recurring_payment',
      module: 'finance',
      writes: true,
      description:
        'Adds a monthly or yearly payment (a server, a domain, a subscription): on its day it ' +
        'becomes an ' +
        "expense automatically. If this month's day has passed, the first charge is next month.",
      parameters: {
        type: 'object',
        properties: RECURRING_FIELDS,
        required: ['name', 'amount', 'currency', 'category', 'dayOfMonth'],
      },
      handler: (userId, args) =>
        this.recurring.create(userId, recurringPaymentInputSchema.parse(args)),
    });

    this.ai.registerTool({
      name: 'finance_update_recurring_payment',
      module: 'finance',
      writes: true,
      description:
        'Changes a recurring payment (price, day, pause with isActive false…): pass its id and ' +
        'only the fields to change.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' }, ...RECURRING_FIELDS },
        required: ['id'],
      },
      handler: async (userId, args) => {
        const current = await find(userId, args);
        const { name, amount, currency, category, dayOfMonth, projectId, isActive } = current;
        const { period, monthOfYear, trialEndsOn } = current;
        const input = recurringPaymentInputSchema.parse({
          name,
          amount,
          currency,
          category,
          dayOfMonth,
          period,
          monthOfYear,
          trialEndsOn,
          projectId,
          isActive,
          ...changedFields(args),
        });
        return this.recurring.update(userId, current.id, input);
      },
    });

    this.ai.registerTool({
      name: 'finance_delete_recurring_payment',
      module: 'finance',
      writes: true,
      confirm: find,
      description:
        'Deletes a recurring payment; expenses it already created stay. To stop it for a while, ' +
        'pause it instead (finance_update_recurring_payment with isActive false).',
      parameters: idParameters('Recurring payment id from finance_recurring_payments'),
      handler: async (userId, args) => {
        await this.recurring.remove(userId, (await find(userId, args)).id);
      },
    });
  }

  /** Cost sources hold API tokens, so they are connected only in the dashboard. */
  private registerCostSourceTools(): void {
    const find = async (userId: string, args: Record<string, unknown>) =>
      findById(await this.costSources.list(userId), args['id'], 'Cost source');

    this.ai.registerTool({
      name: 'finance_cost_sources',
      module: 'finance',
      description:
        'Automatic cost import (Hetzner, DeepSeek): id, name, amount for the current month, ' +
        'last sync and error.',
      parameters: NO_PARAMETERS,
      handler: (userId) => this.costSources.list(userId),
    });

    this.ai.registerTool({
      name: 'finance_sync_cost_source',
      module: 'finance',
      writes: true,
      description: 'Imports the latest costs from a cost source now instead of waiting.',
      parameters: idParameters('Cost source id from finance_cost_sources'),
      handler: async (userId, args) => {
        const source = await find(userId, args);
        await this.costSources.syncOne(userId, source.id);
        return findById(await this.costSources.list(userId), source.id, 'Cost source');
      },
    });

    this.ai.registerTool({
      name: 'finance_delete_cost_source',
      module: 'finance',
      writes: true,
      confirm: find,
      description: 'Stops importing costs from a source and forgets its token.',
      parameters: idParameters('Cost source id from finance_cost_sources'),
      handler: async (userId, args) => {
        await this.costSources.remove(userId, (await find(userId, args)).id);
      },
    });
  }
}

/** Not the whole list: a hundred rows would only fill the model context. */
function importSummary(added: Transaction[]) {
  const totals = new Map<string, number>();
  for (const { kind, currency, amount } of added) {
    const key = `${kind} ${currency}`;
    totals.set(key, (totals.get(key) ?? 0) + amount);
  }
  return {
    added: added.length,
    from: added.reduce((min, t) => (t.occurredOn < min ? t.occurredOn : min), added[0]?.occurredOn),
    to: added.reduce((max, t) => (t.occurredOn > max ? t.occurredOn : max), added[0]?.occurredOn),
    totals: [...totals].map(([key, total]) => ({ [key]: Math.round(total * 100) / 100 })),
  };
}

function toQuery(args: Record<string, unknown>): TransactionQuery {
  const scope = typeof args['scope'] === 'string' && args['scope'] ? args['scope'] : undefined;
  return { from: String(args['from']), to: String(args['to']), scope };
}
