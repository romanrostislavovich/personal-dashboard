import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService } from '@pd/api-core';
import { BirthdaysService } from './birthdays.service';

/** AI access to birthdays. */
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
        'Birthdays in the next N days (0 — today): name, date, days until, ' +
        'age they are turning, note (often contains gift ideas).',
      parameters: {
        type: 'object',
        properties: { days: { type: 'number', description: 'Horizon in days, 30 by default' } },
      },
      handler: async (userId, args) => {
        const days = typeof args['days'] === 'number' ? args['days'] : 30;
        return (await this.birthdays.list(userId)).filter((b) => b.daysUntil <= days);
      },
    });
  }
}
