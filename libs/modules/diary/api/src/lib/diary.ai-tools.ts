import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS, PERIOD_PARAMETERS } from '@pd/api-core';
import { z } from 'zod';
import { DiaryService } from './diary.service';

/** Optional day; the model gets today's date from the system prompt. */
const DAY = { type: 'string', description: 'YYYY-MM-DD, today if omitted' };
const noteArgs = z.object({
  text: z.string().trim().min(1).max(10_000),
  day: z.iso.date().optional(),
});
const moodArgs = z.object({ mood: z.number().int().min(1).max(5), day: z.iso.date().optional() });

/** AI access to the diary: entries for a period and statistics; notes and mood (assistant). */
@Injectable()
export class DiaryAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly diary: DiaryService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'diary_entries',
      module: 'diary',
      description:
        'Diary entries for a period: date, mood 1–5, tags and text (markdown). ' +
        'For questions about past days, events, mood.',
      parameters: PERIOD_PARAMETERS,
      handler: (userId, args) =>
        this.diary.list(userId, { from: String(args['from']), to: String(args['to']) }),
    });

    this.ai.registerTool({
      name: 'diary_stats',
      module: 'diary',
      description:
        'Diary statistics: current and longest day streak, number of entries, whether there is an entry today, ' +
        'mood over 30 days, frequent tags.',
      parameters: NO_PARAMETERS,
      handler: (userId) => this.diary.stats(userId),
    });

    this.ai.registerTool({
      name: 'diary_add_note',
      module: 'diary',
      writes: true,
      description:
        'Appends a note to the diary entry of a day (does not replace the text). ' +
        'Write it in the first person, as the user would; keep #hashtags if the user used them.',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string', description: 'The note, markdown' }, day: DAY },
        required: ['text'],
      },
      handler: async (userId, args) => {
        const { text, day } = noteArgs.parse(args);
        const entry = await this.diary.appendNote(userId, day ?? this.diary.todayDate(), text);
        return { saved: true, day: entry?.day, content: entry?.content };
      },
    });

    this.ai.registerTool({
      name: 'diary_set_mood',
      module: 'diary',
      writes: true,
      description: 'Sets the mood of a day: 1 — awful, 2 — meh, 3 — okay, 4 — good, 5 — great.',
      parameters: {
        type: 'object',
        properties: { mood: { type: 'number', description: '1–5' }, day: DAY },
        required: ['mood'],
      },
      handler: async (userId, args) => {
        const { mood, day } = moodArgs.parse(args);
        const entry = await this.diary.setMood(userId, day ?? this.diary.todayDate(), mood);
        return { saved: true, day: entry?.day, mood: entry?.mood };
      },
    });
  }
}
