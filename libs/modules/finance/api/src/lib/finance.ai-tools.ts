import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS, PERIOD_PARAMETERS } from '@pd/api-core';
import { TRANSACTION_KINDS, transactionInputSchema, TransactionQuery } from '@pd/contracts';
import { RecurringPaymentsService } from './recurring/recurring-payments.service';
import { TransactionsService } from './transactions/transactions.service';

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

/** AI access to finance: totals, transactions, recurring payments; adding transactions (assistant). */
@Injectable()
export class FinanceAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly transactions: TransactionsService,
    private readonly recurring: RecurringPaymentsService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'finance_summary',
      module: 'finance',
      description:
        'Income, expenses and balance by currency for a period, and the main expense categories. ' +
        'Project ids are available via core_projects.',
      parameters: QUERY_PARAMETERS,
      handler: (userId, args) => this.transactions.summary(userId, toQuery(args)),
    });

    this.ai.registerTool({
      name: 'finance_transactions',
      module: 'finance',
      description:
        'Transactions for a period: date, income/expense, amount, currency, category, project.',
      parameters: QUERY_PARAMETERS,
      handler: (userId, args) => this.transactions.list(userId, toQuery(args)),
    });

    this.ai.registerTool({
      name: 'finance_recurring_payments',
      module: 'finance',
      description:
        'Recurring payments (servers, domains, subscriptions): amount, charge day, whether active.',
      parameters: NO_PARAMETERS,
      handler: (userId) => this.recurring.list(userId),
    });

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
        properties: {
          kind: { type: 'string', enum: [...TRANSACTION_KINDS] },
          amount: { type: 'number', description: 'Positive number' },
          currency: { type: 'string', description: 'ISO 4217: EUR, USD, PLN…' },
          category: { type: 'string', description: 'E.g. Food, Hosting, Salary' },
          note: { type: 'string' },
          occurredOn: { type: 'string', description: 'YYYY-MM-DD' },
          projectId: { type: 'string', description: 'Project id; omit for personal' },
        },
        required: ['kind', 'amount', 'currency', 'category', 'occurredOn'],
      },
      handler: (userId, args) =>
        this.transactions.create(userId, transactionInputSchema.parse(args)),
    });
  }
}

function toQuery(args: Record<string, unknown>): TransactionQuery {
  const scope = typeof args['scope'] === 'string' && args['scope'] ? args['scope'] : undefined;
  return { from: String(args['from']), to: String(args['to']), scope };
}
