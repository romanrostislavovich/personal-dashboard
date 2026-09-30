import { Injectable } from '@nestjs/common';
import { AiService } from '@pd/api-core';
import { DiaryQuery } from '@pd/contracts';
import { DiaryService } from './diary.service';

/** AiService.complete() adds the answer language itself — from the user profile. */
const INSTRUCTION = [
  'You help the user keep a personal diary. Write a short, warm summary of the entries:',
  'main events, how the mood changed, recurring topics (by tags), what went well.',
  'End with one gentle observation or question to reflect on. Address the user informally,',
  'up to 150 words, plain text without markdown, no inventions — only what is in the entries.',
].join(' ');

/** AI summary of the diary for a period. */
@Injectable()
export class DiarySummaryService {
  constructor(
    private readonly diary: DiaryService,
    private readonly ai: AiService,
  ) {}

  /** `null` if there are no entries for the period — nothing to summarize. */
  async summarize(
    userId: string,
    { from, to }: Pick<DiaryQuery, 'from' | 'to'>,
  ): Promise<string | null> {
    const entries = await this.diary.list(userId, { from, to });
    if (entries.length === 0) {
      return null;
    }
    const text = [...entries]
      .reverse()
      .map((e) => `### ${e.day}${e.mood ? ` (mood ${e.mood}/5)` : ''}\n${e.content}`)
      .join('\n\n');
    return this.ai.complete(userId, INSTRUCTION, text, 'diary');
  }
}
