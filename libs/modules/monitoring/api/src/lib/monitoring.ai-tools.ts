import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS } from '@pd/api-core';
import { MonitorsService } from './monitors.service';

/** Доступ AI к мониторингу сайтов. */
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
        'Статус сайтов: работает/упал (и с какого момента), последняя ошибка, время ответа, ' +
        'доступность за 24 ч / 7 / 30 дней, срок SSL-сертификата.',
      parameters: NO_PARAMETERS,
      // График по часам модели не нужен — экономим контекст.
      handler: async (userId) =>
        (await this.monitors.list(userId)).map((monitor) => ({
          ...monitor,
          responseTimes: undefined,
        })),
    });
  }
}
