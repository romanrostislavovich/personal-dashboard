import { Injectable, OnModuleInit } from '@nestjs/common';
import { ServerActions } from '@pd/api-core';
import { costSourceInputSchema, wishInputSchema } from '@pd/contracts';
import { z } from 'zod';
import { CostSourcesService } from './cost-sources/cost-sources.service';
import { WishlistService } from './wishlist/wishlist.service';

/**
 * Finance actions that call outside services — the providers' APIs, a shop's page — run on the
 * server (see ServerActions).
 */
export const FINANCE_ACTIONS = {
  addCostSource: 'finance.add-cost-source',
  syncCostSource: 'finance.sync-cost-source',
  addWish: 'finance.add-wish',
  checkWish: 'finance.check-wish',
} as const;

const idArgs = z.object({ id: z.uuid() });

@Injectable()
export class FinanceServerActions implements OnModuleInit {
  constructor(
    private readonly actions: ServerActions,
    private readonly costSources: CostSourcesService,
    private readonly wishlist: WishlistService,
  ) {}

  onModuleInit(): void {
    this.actions.register(FINANCE_ACTIONS.addCostSource, (userId, args) =>
      this.costSources.create(userId, costSourceInputSchema.parse(args)),
    );
    this.actions.register(FINANCE_ACTIONS.syncCostSource, (userId, args) =>
      this.costSources.syncOne(userId, idArgs.parse(args).id),
    );
    this.actions.register(FINANCE_ACTIONS.addWish, (userId, args) =>
      this.wishlist.create(userId, wishInputSchema.parse(args)),
    );
    this.actions.register(FINANCE_ACTIONS.checkWish, (userId, args) =>
      this.wishlist.check(userId, idArgs.parse(args).id),
    );
  }
}
