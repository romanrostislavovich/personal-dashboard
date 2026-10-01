import { Injectable, OnModuleInit } from '@nestjs/common';
import { ServerActions } from '@pd/api-core';
import { wakatimeKeyInputSchema } from '@pd/contracts';
import { WakatimeService } from './wakatime.service';

/** WakaTime requests run on the server (see ServerActions). */
export const WAKATIME_ACTIONS = {
  connect: 'development.connect-wakatime',
  sync: 'development.sync-wakatime',
} as const;

@Injectable()
export class WakatimeServerActions implements OnModuleInit {
  constructor(
    private readonly actions: ServerActions,
    private readonly wakatime: WakatimeService,
  ) {}

  onModuleInit(): void {
    this.actions.register(WAKATIME_ACTIONS.connect, (userId, args) =>
      this.wakatime.connect(userId, wakatimeKeyInputSchema.parse(args).apiKey),
    );
    this.actions.register(WAKATIME_ACTIONS.sync, (userId) => this.wakatime.sync(userId));
  }
}
