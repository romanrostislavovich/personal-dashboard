import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService } from '@pd/api-core';
import { birthdayInputSchema } from '@pd/contracts';
import { BirthdaysService } from './birthdays.service';

/** AI access to birthdays: the upcoming ones; adding (assistant). */
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

    this.ai.registerTool({
      name: 'birthdays_add',
      module: 'birthdays',
      writes: true,
      description:
        'Adds a birthday to remember. The year is optional — leave it out if unknown. ' +
        'Reminders are sent on the day, a day before and a week before.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'How the user calls the person, may say who it is: "Masha (sister)"',
          },
          day: { type: 'number', description: 'Day of month' },
          month: { type: 'number', description: '1–12' },
          year: { type: 'number', description: 'Birth year, only if known' },
          note: { type: 'string', description: 'Gift ideas or other details' },
        },
        required: ['name', 'day', 'month'],
      },
      handler: (userId, args) => this.birthdays.create(userId, birthdayInputSchema.parse(args)),
    });
  }
}
