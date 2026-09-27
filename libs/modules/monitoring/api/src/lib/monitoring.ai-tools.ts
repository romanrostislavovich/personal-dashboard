import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, findById, idParameters, NO_PARAMETERS } from '@pd/api-core';
import { monitorInputSchema } from '@pd/contracts';
import { CheckerService } from './checker.service';
import { MonitorsService } from './monitors.service';

/** AI access to site monitoring; adding and removing monitored addresses (assistant). */
@Injectable()
export class MonitoringAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly monitors: MonitorsService,
    private readonly checker: CheckerService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'monitoring_status',
      module: 'monitoring',
      description:
        'Site status: id, URL, up/down (and since when), last error, response time, ' +
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
        // Like the dashboard: check right away so the status is not "pending" for 5 minutes.
        await this.checker.checkNew(monitor);
        const created = findById(await this.monitors.list(userId), monitor.id, 'Monitor');
        return { ...created, responseTimes: undefined };
      },
    });

    const find = async (userId: string, args: Record<string, unknown>) =>
      findById(await this.monitors.list(userId), args['id'], 'Monitor');

    this.ai.registerTool({
      name: 'monitoring_remove',
      module: 'monitoring',
      writes: true,
      confirm: async (userId, args) => {
        const { url, status } = await find(userId, args);
        return { url, status };
      },
      description: 'Stops monitoring a URL and deletes its check history.',
      parameters: idParameters('Monitor id from monitoring_status'),
      handler: async (userId, args) => {
        await this.monitors.remove(userId, (await find(userId, args)).id);
      },
    });
  }
}
