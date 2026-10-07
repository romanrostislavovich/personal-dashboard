import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, changedFields, findById, idParameters } from '@pd/api-core';
import { birthdayInputSchema, daysUntilNearest } from '@pd/contracts';
import { BirthdaysService } from './birthdays.service';

/** Fields of a birthday, shared by adding and editing. */
const BIRTHDAY_FIELDS = {
  name: {
    type: 'string',
    description: 'How the user calls the person, may say who it is: "Masha (sister)"',
  },
  day: { type: 'number', description: 'Day of month of the birthday' },
  month: { type: 'number', description: 'Month of the birthday, 1–12' },
  year: { type: 'number', description: 'Birth year, only if known; null clears' },
  deathDay: {
    type: 'number',
    description: 'For someone who has died: the day of month they died; null — alive',
  },
  deathMonth: { type: 'number', description: 'The month they died, 1–12' },
  deathYear: { type: 'number', description: 'The year they died, only if known; null clears' },
  memorialRemindDaysBefore: {
    type: 'array',
    items: { type: 'number' },
    description: 'Days before the day of memory to remind, 0 — on the day. Default [0, 1]',
  },
  note: { type: 'string', description: 'Gift ideas or other details; null clears' },
  remindDaysBefore: {
    type: 'array',
    items: { type: 'number' },
    description: 'Days before to remind, 0 — on the day. Default [0, 1, 7]',
  },
} as const;

/**
 * AI access to birthdays and days of memory: the upcoming ones; adding, editing and deleting
 * (assistant).
 */
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
        'People whose birthday or day of memory is in the next N days (0 — today): id, name, ' +
        'the birthday (`nextDate`, `daysUntil`, `turningAge`), a note (often gift ideas), ' +
        '`giftIdeas` — products of the wishlist marked as a gift for them, with the price — and ' +
        '`memorial` — for someone who has died, the next day of memory with the years since; ' +
        'their birthday is then a day to remember them, not to congratulate. 366 days — all ' +
        'of them.',
      parameters: {
        type: 'object',
        properties: { days: { type: 'number', description: 'Horizon in days, 30 by default' } },
      },
      handler: async (userId, args) => {
        const days = typeof args['days'] === 'number' ? args['days'] : 30;
        return (await this.birthdays.list(userId)).filter((b) => daysUntilNearest(b) <= days);
      },
    });

    this.ai.registerTool({
      name: 'birthdays_add',
      module: 'birthdays',
      writes: true,
      description:
        'Adds a person with a date to remember: the birthday (`day`, `month`), the day they ' +
        'died (`deathDay`, `deathMonth`) or both — at least one. Years are optional. ' +
        'Reminders: of a birthday on the day, a day and a week before; of a day of memory on ' +
        'the day and the day before; unless set otherwise.',
      parameters: {
        type: 'object',
        properties: BIRTHDAY_FIELDS,
        required: ['name'],
      },
      handler: (userId, args) => this.birthdays.create(userId, birthdayInputSchema.parse(args)),
    });

    this.ai.registerTool({
      name: 'birthdays_update',
      module: 'birthdays',
      writes: true,
      description:
        'Changes a person: pass the id (from birthdays_upcoming with days 366) and only the ' +
        'fields to change — for one who has died, add `deathDay` and `deathMonth`.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' }, ...BIRTHDAY_FIELDS },
        required: ['id'],
      },
      handler: async (userId, args) => {
        const current = await this.find(userId, args);
        const input = birthdayInputSchema.parse({
          name: current.name,
          day: current.day,
          month: current.month,
          year: current.year,
          note: current.note,
          remindDaysBefore: current.remindDaysBefore,
          deathDay: current.deathDay,
          deathMonth: current.deathMonth,
          deathYear: current.deathYear,
          memorialRemindDaysBefore: current.memorialRemindDaysBefore,
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
      description: 'Deletes a person with their birthday, day of memory and reminders.',
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
