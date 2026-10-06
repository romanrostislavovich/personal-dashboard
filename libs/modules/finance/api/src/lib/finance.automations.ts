import { Injectable, OnModuleInit } from '@nestjs/common';
import { AutomationsService } from '@pd/api-core';
import { TransactionsService } from './transactions/transactions.service';

/**
 * Finance in the rules "if X, then Y": an expense over an amount, a budget at 80% or spent, a
 * changed price in the wishlist.
 */
@Injectable()
export class FinanceAutomations implements OnModuleInit {
  constructor(
    private readonly automations: AutomationsService,
    private readonly transactions: TransactionsService,
  ) {}

  onModuleInit(): void {
    this.automations.registerTrigger({
      id: 'finance.expense',
      module: 'finance',
      labelKey: 'finance.automations.expense',
      description:
        'An expense was recorded; `min` — only from this amount in the main currency, ' +
        '`category` — only this category',
      params: [
        { name: 'min', type: 'number', labelKey: 'finance.automations.min' },
        { name: 'category', type: 'text', labelKey: 'finance.automations.category' },
      ],
      variables: ['amount', 'currency', 'category', 'note'],
      matches: (params, vars) =>
        (!params['min'] || Number(vars['mainAmount']) >= Number(params['min'])) &&
        (!params['category'] ||
          vars['category'].toLowerCase() === params['category'].trim().toLowerCase()),
    });
    this.automations.registerTrigger({
      id: 'finance.budget',
      module: 'finance',
      labelKey: 'finance.automations.budget',
      description: 'A monthly budget reached 80% (`level` warned) or was spent (`level` exceeded)',
      params: [
        {
          name: 'level',
          type: 'select',
          labelKey: 'finance.automations.level',
          options: [
            { value: 'any', labelKey: 'finance.automations.levels.any' },
            { value: 'warned', labelKey: 'finance.automations.levels.warned' },
            { value: 'exceeded', labelKey: 'finance.automations.levels.exceeded' },
          ],
        },
      ],
      variables: ['category', 'spent', 'limit', 'currency'],
      matches: (params, vars) =>
        !params['level'] || params['level'] === 'any' || params['level'] === vars['level'],
    });
    this.automations.registerTrigger({
      id: 'finance.wish-price',
      module: 'finance',
      labelKey: 'finance.automations.wishPrice',
      description:
        'The price of a product in the wishlist changed: `direction` down — it got cheaper, ' +
        'up — more expensive',
      params: [
        {
          name: 'direction',
          type: 'select',
          labelKey: 'finance.automations.direction',
          options: [
            { value: 'any', labelKey: 'finance.automations.directions.any' },
            { value: 'down', labelKey: 'finance.automations.directions.down' },
            { value: 'up', labelKey: 'finance.automations.directions.up' },
          ],
        },
      ],
      variables: ['name', 'price', 'was', 'currency', 'url'],
      matches: (params, vars) =>
        !params['direction'] ||
        params['direction'] === 'any' ||
        params['direction'] === vars['direction'],
    });

    this.transactions.onCreated((userId, created) => {
      for (const transaction of created.filter((t) => t.kind === 'expense')) {
        void this.automations.emit(userId, 'finance.expense', {
          amount: transaction.amount.toFixed(2),
          currency: transaction.currency,
          mainAmount: String(transaction.mainAmount ?? transaction.amount),
          category: transaction.category,
          note: transaction.note ?? '',
        });
      }
    });
  }
}
