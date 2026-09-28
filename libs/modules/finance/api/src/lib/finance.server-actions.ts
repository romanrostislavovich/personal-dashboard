import { Injectable, OnModuleInit } from '@nestjs/common';
import { ServerActions } from '@pd/api-core';
import { costSourceInputSchema } from '@pd/contracts';
import { z } from 'zod';
import { CostSourcesService } from './cost-sources/cost-sources.service';

/** Finance actions that call the providers' APIs run on the server (see ServerActions). */
export const FINANCE_ACTIONS = {
  addCostSource: 'finance.add-cost-source',
  syncCostSource: 'finance.sync-cost-source',
} as const;

const idArgs = z.object({ id: z.uuid() });

@Injectable()
export class FinanceServerActions implements OnModuleInit {
  constructor(
    private readonly actions: ServerActions,
    private readonly costSources: CostSourcesService,
  ) {}

  onModuleInit(): void {
    this.actions.register(FINANCE_ACTIONS.addCostSource, (userId, args) =>
      this.costSources.create(userId, costSourceInputSchema.parse(args)),
    );
    this.actions.register(FINANCE_ACTIONS.syncCostSource, (userId, args) =>
      this.costSources.syncOne(userId, idArgs.parse(args).id),
    );
  }
}
