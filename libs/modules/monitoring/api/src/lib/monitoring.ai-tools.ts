import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS } from '@pd/api-core';
import { MonitorsService } from './monitors.service';

/** AI access to site monitoring. */
@Injectable()
export class MonitoringAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly monitors: MonitorsService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'monitoring_status',
      module: 'monitoring',
      description:
        'Site status: up/down (and since when), last error, response time, ' +
        'availability over 24 h / 7 / 30 days, SSL certificate expiry.',
      parameters: NO_PARAMETERS,
      // The model does not need the hourly chart — save context.
      handler: async (userId) =>
        (await this.monitors.list(userId)).map((monitor) => ({
          ...monitor,
          responseTimes: undefined,
        })),
    });
  }
}
