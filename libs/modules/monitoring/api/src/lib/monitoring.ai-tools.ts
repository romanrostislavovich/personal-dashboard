import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS } from '@pd/api-core';
import { monitorInputSchema } from '@pd/contracts';
import { MonitorsService } from './monitors.service';

/** AI access to site monitoring; adding a monitored address (assistant). */
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

    this.ai.registerTool({
      name: 'monitoring_add',
      module: 'monitoring',
      writes: true,
      description:
        'Starts monitoring a URL (uptime every 5 minutes, SSL expiry). Every monitor belongs to ' +
        'a project: take its id from core_projects; if there is no suitable project, ask the user.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'https://… — the site or a health endpoint' },
          projectId: { type: 'string' },
        },
        required: ['url', 'projectId'],
      },
      handler: async (userId, args) => {
        const monitor = await this.monitors.create(userId, monitorInputSchema.parse(args));
        return { monitoring: monitor.url };
      },
    });
  }
}
