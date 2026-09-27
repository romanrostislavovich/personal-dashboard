import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService } from '@pd/api-core';
import { BirthdaysService } from './birthdays.service';

/** Доступ AI к дням рождения. */
@Injectable()
export class BirthdaysAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly birthdays: BirthdaysService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'birthdays_upcoming',
      module: 'birthdays',
      description:
        'Дни рождения в ближайшие N дней (0 — сегодня): имя, дата, через сколько дней, ' +
        'сколько исполнится, заметка (там бывают идеи подарков).',
      parameters: {
        type: 'object',
        properties: { days: { type: 'number', description: 'Горизонт в днях, по умолчанию 30' } },
      },
      handler: async (userId, args) => {
        const days = typeof args['days'] === 'number' ? args['days'] : 30;
        return (await this.birthdays.list(userId)).filter((b) => b.daysUntil <= days);
      },
    });
  }
}
