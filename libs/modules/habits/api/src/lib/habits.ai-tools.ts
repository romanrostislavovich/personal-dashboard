import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService } from '@pd/api-core';
import { habitDayInputSchema } from '@pd/contracts';
import { z } from 'zod';
import { HabitsService } from './habits.service';

const markArgs = habitDayInputSchema.extend({
  habitId: z.uuid(),
  day: z.iso.date(),
});

/**
 * AI access to the habits: how each goes (the run of clean days, the week), and marking a day
 * — "I had a drink today" in Telegram is enough.
 */
@Injectable()
export class HabitsAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly habits: HabitsService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'habits_list',
      module: 'habits',
      description:
        'Habits the user quits, cuts down or builds: id, `kind` (alcohol, smoking, custom with ' +
        'its `name`), `goal` (quit; less — at most `maxDaysPerWeek` days a week; daily or ' +
        'weekly — `timesPerWeek` — for a habit to build, where `currentStreak` counts days done), `unit` a day ' +
        'is counted in, `startedOn`, and `stats`: `currentStreak` (clean days in a row up to ' +
        'today), `bestStreak`, `cleanDays`, `usedDays`, `usedThisWeek`, `weeksWithinLimit`. A ' +
        'day nobody marked is clean. Be kind about a slip: it is part of the way.',
      parameters: { type: 'object', properties: {} },
      handler: async (userId) =>
        // Without the calendar of marks: the numbers tell the model what it needs.
        (await this.habits.list(userId)).map((habit) => ({ ...habit, recent: undefined })),
    });

    this.ai.registerTool({
      name: 'habits_mark_day',
      module: 'habits',
      writes: true,
      description:
        'Marks a day of a habit (ids from habits_list): `used` — the day was with it ("I had ' +
        'a drink", "smoked 3"), with `amount` in its unit when told; `clean` — without; `done` ' +
        '— a habit to build was done today ("went to the gym"). The ' +
        'run of clean days starts again after a `used` day; achievements already unlocked stay.',
      parameters: {
        type: 'object',
        properties: {
          habitId: { type: 'string' },
          day: { type: 'string', description: 'YYYY-MM-DD, the user’s today by default' },
          status: { type: 'string', enum: ['used', 'clean', 'done'] },
          amount: { type: 'number', description: 'How much, in the habit’s unit; optional' },
        },
        required: ['habitId', 'day', 'status'],
      },
      handler: (userId, args) => {
        const { habitId, day, ...input } = markArgs.parse(args);
        return this.habits.mark(userId, habitId, day, input);
      },
    });
  }
}
