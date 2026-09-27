import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS, PERIOD_PARAMETERS } from '@pd/api-core';
import { diarySearchQuerySchema, diarySettingsSchema } from '@pd/contracts';
import { z } from 'zod';
import { DiaryService } from './diary.service';

/** Optional day; the model gets today's date from the system prompt. */
const DAY = { type: 'string', description: 'YYYY-MM-DD, today if omitted' };
const noteArgs = z.object({
  text: z.string().trim().min(1).max(10_000),
  day: z.iso.date().optional(),
});
const moodArgs = z.object({ mood: z.number().int().min(1).max(5), day: z.iso.date().optional() });
const replaceArgs = z.object({
  day: z.iso.date(),
  find: z.string().min(1),
  replaceWith: z.string().max(10_000),
});
const dayArgs = z.object({ day: z.iso.date() });

/**
 * AI access to the diary: entries, search, statistics and settings;
 * notes, mood, corrections and deleting a day (assistant).
 */
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

    this.ai.registerTool({
      name: 'diary_search',
      module: 'diary',
      description:
        'Finds diary entries containing the text (case-insensitive): day, mood, a snippet. ' +
        'For "when did I…" questions.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'At least 2 characters' } },
        required: ['query'],
      },
      handler: (userId, args) =>
        this.diary.search(userId, diarySearchQuerySchema.parse({ q: args['query'] }).q),
    });

    this.ai.registerTool({
      name: 'diary_replace_text',
      module: 'diary',
      writes: true,
      description:
        "Corrects a day's entry: replaces every occurrence of an exact fragment " +
        '(copy it from diary_entries). An empty replaceWith removes the fragment.',
      parameters: {
        type: 'object',
        properties: {
          day: { type: 'string', description: 'YYYY-MM-DD' },
          find: { type: 'string', description: 'Exact text from the entry' },
          replaceWith: { type: 'string' },
        },
        required: ['day', 'find', 'replaceWith'],
      },
      handler: async (userId, args) => {
        const { day, find, replaceWith } = replaceArgs.parse(args);
        const entry = await this.diary.get(userId, day);
        const occurrences = entry ? entry.content.split(find).length - 1 : 0;
        if (!entry || occurrences === 0) {
          throw new Error('The fragment is not in this entry — copy it exactly from diary_entries');
        }
        const content = entry.content.split(find).join(replaceWith);
        if (!content.trim() && entry.mood === null) {
          // Saving would delete the entry — that needs the user's confirmation.
          throw new Error('This would empty the entry — use diary_delete_entry instead');
        }
        const saved = await this.diary.save(userId, day, { content, mood: entry.mood });
        return { replaced: occurrences, day, content: saved?.content ?? '' };
      },
    });

    this.ai.registerTool({
      name: 'diary_delete_entry',
      module: 'diary',
      writes: true,
      confirm: async (userId, args) => {
        const entry = await this.diary.get(userId, dayArgs.parse(args).day);
        if (!entry) {
          throw new Error('There is no entry for this day');
        }
        return { day: entry.day, mood: entry.mood, content: entry.content.slice(0, 500) };
      },
      description: "Deletes a whole day's entry: text and mood (photos stay).",
      parameters: {
        type: 'object',
        properties: { day: { type: 'string', description: 'YYYY-MM-DD' } },
        required: ['day'],
      },
      handler: (userId, args) => this.diary.remove(userId, dayArgs.parse(args).day),
    });

    this.ai.registerTool({
      name: 'diary_settings',
      module: 'diary',
      description:
        'Diary settings: evening reminder at 21:00, AI summary of the week on Sundays, ' +
        'template for a new day.',
      parameters: NO_PARAMETERS,
      handler: (userId) => this.diary.getSettings(userId),
    });

    this.ai.registerTool({
      name: 'diary_update_settings',
      module: 'diary',
      writes: true,
      description: 'Changes diary settings; pass only the ones to change.',
      parameters: {
        type: 'object',
        properties: {
          eveningReminder: { type: 'boolean' },
          weeklySummary: { type: 'boolean' },
          template: { type: 'string', description: 'null — no template' },
        },
      },
      handler: async (userId, args) => {
        const current = await this.diary.getSettings(userId);
        return this.diary.saveSettings(userId, diarySettingsSchema.parse({ ...current, ...args }));
      },
    });
  }
}
