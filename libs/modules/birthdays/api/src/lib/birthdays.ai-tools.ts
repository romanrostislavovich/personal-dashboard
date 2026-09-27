import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, changedFields, findById, idParameters } from '@pd/api-core';
import { birthdayInputSchema } from '@pd/contracts';
import { BirthdaysService } from './birthdays.service';

/** Fields of a birthday, shared by adding and editing. */
const BIRTHDAY_FIELDS = {
  name: {
    type: 'string',
    description: 'How the user calls the person, may say who it is: "Masha (sister)"',
  },
  day: { type: 'number', description: 'Day of month' },
  month: { type: 'number', description: '1–12' },
  year: { type: 'number', description: 'Birth year, only if known; null clears' },
  note: { type: 'string', description: 'Gift ideas or other details; null clears' },
  remindDaysBefore: {
    type: 'array',
    items: { type: 'number' },
    description: 'Days before to remind, 0 — on the day. Default [0, 1, 7]',
  },
} as const;

/** AI access to birthdays: the upcoming ones; adding, editing and deleting (assistant). */
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
        'Birthdays in the next N days (0 — today): id, name, date, days until, ' +
        'age they are turning, note (often contains gift ideas). 366 days — all of them.',
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
        'Reminders are sent on the day, a day before and a week before unless set otherwise.',
      parameters: {
        type: 'object',
        properties: BIRTHDAY_FIELDS,
        required: ['name', 'day', 'month'],
      },
      handler: (userId, args) => this.birthdays.create(userId, birthdayInputSchema.parse(args)),
    });

    this.ai.registerTool({
      name: 'birthdays_update',
      module: 'birthdays',
      writes: true,
      description:
        'Changes a birthday: pass its id (from birthdays_upcoming with days 366) and only ' +
        'the fields to change.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' }, ...BIRTHDAY_FIELDS },
        required: ['id'],
      },
      handler: async (userId, args) => {
        const current = await this.find(userId, args);
        const { name, day, month, year, note, remindDaysBefore } = current;
        const input = birthdayInputSchema.parse({
          name,
          day,
          month,
          year,
          note,
          remindDaysBefore,
          ...changedFields(args),
        });
        return this.birthdays.update(userId, current.id, input);
      },
    });

    this.ai.registerTool({
      name: 'birthdays_delete',
      module: 'birthdays',
      writes: true,
      confirm: (userId, args) => this.find(userId, args),
      description: 'Deletes a birthday and its reminders.',
      parameters: idParameters('Birthday id from birthdays_upcoming'),
      handler: async (userId, args) => {
        await this.birthdays.remove(userId, (await this.find(userId, args)).id);
      },
    });
  }

  private async find(userId: string, args: Record<string, unknown>) {
    return findById(await this.birthdays.list(userId), args['id'], 'Birthday');
  }
}
