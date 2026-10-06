import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerService } from '@pd/api-core';
import { WishlistService } from './wishlist.service';

/** Every morning reads the prices of the wishlist again; a changed one is reported. */
@Injectable()
export class WishlistJob implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly wishlist: WishlistService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'finance.wishlist-prices',
      cron: '0 7 * * *',
      handler: () => this.wishlist.checkAll(),
    });
  }
}
