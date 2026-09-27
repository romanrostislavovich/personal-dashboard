import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS, PERIOD_PARAMETERS } from '@pd/api-core';
import { TransactionQuery } from '@pd/contracts';
import { RecurringPaymentsService } from './recurring/recurring-payments.service';
import { TransactionsService } from './transactions/transactions.service';

/** Схема периода + необязательный «кошелёк». */
const QUERY_PARAMETERS = {
  type: 'object',
  properties: {
    ...PERIOD_PARAMETERS.properties,
    scope: {
      type: 'string',
      description: '«personal» — только личные, id проекта — только проект, пусто — все',
    },
  },
  required: ['from', 'to'],
};

/** Доступ AI к финансам: итоги, операции, регулярные платежи. */
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
        'Доходы, расходы и баланс по валютам за период и главные статьи расходов. ' +
        'Id проектов можно узнать через core_projects.',
      parameters: QUERY_PARAMETERS,
      handler: (userId, args) => this.transactions.summary(userId, toQuery(args)),
    });

    this.ai.registerTool({
      name: 'finance_transactions',
      module: 'finance',
      description:
        'Список операций за период: дата, доход/расход, сумма, валюта, категория, проект.',
      parameters: QUERY_PARAMETERS,
      handler: (userId, args) => this.transactions.list(userId, toQuery(args)),
    });

    this.ai.registerTool({
      name: 'finance_recurring_payments',
      module: 'finance',
      description:
        'Регулярные платежи (серверы, домены, подписки): сумма, день списания, активность.',
      parameters: NO_PARAMETERS,
      handler: (userId) => this.recurring.list(userId),
    });
  }
}

function toQuery(args: Record<string, unknown>): TransactionQuery {
  const scope = typeof args['scope'] === 'string' && args['scope'] ? args['scope'] : undefined;
  return { from: String(args['from']), to: String(args['to']), scope };
}
