import { Injectable } from '@nestjs/common';
import { AiService, LifeService, UsersService } from '@pd/api-core';
import { DiaryQuery } from '@pd/contracts';
import { DiaryService } from './diary.service';

/** AiService.complete() adds the answer language itself — from the user profile. */
const INSTRUCTION = [
  'You help the user keep a personal diary. Write a short, warm summary of the entries:',
  'main events, how the mood changed, recurring topics (by tags), what went well.',
  'End with one gentle observation or question to reflect on. Address the user informally,',
  'up to 150 words, plain text without markdown, no inventions — only what is in the entries.',
].join(' ');

/** The Sunday review: the week across the sections, and questions to answer in the diary. */
const WEEKLY_INSTRUCTION = [
  'You help the user look back at their week. Below are their diary entries and the numbers',
  'of the week from the sections of their dashboard (money, tasks, time at the computer,',
  'music, habits…). Write a short, warm review: what the week was about, what went well, what',
  'took the most. Then ask 2–3 short questions to reflect on (what to keep, what to change, the',
  'main thing of the next week), one per line, starting with "—". Address the user informally,',
  'up to 180 words, plain text without markdown, no inventions — only what is given.',
].join(' ');

/** AI summary of the diary for a period. */
@Injectable()
export class DiarySummaryService {
  constructor(
    private readonly diary: DiaryService,
    private readonly ai: AiService,
    private readonly life: LifeService,
    private readonly users: UsersService,
  ) {}

  /**
   * The week across the sections — the diary and the numbers of the week of Life — with 2–3
   * questions. The sections kept from the shared AI, or hidden, stay out. `null` — a week with
   * nothing to look back at.
   */
  async weeklyReview(
    userId: string,
    period: Pick<DiaryQuery, 'from' | 'to'>,
  ): Promise<string | null> {
    const hidden = [
      ...(await this.ai.hiddenFromShared(userId)),
      ...this.users.hiddenSections(await this.users.findById(userId)),
      // The diary is told by its entries below.
      'diary',
    ];
    const [entries, cards] = await Promise.all([
      this.diary.list(userId, period),
      this.life.period(userId, period, hidden),
    ]);
    if (entries.length === 0 && cards.length === 0) {
      return null;
    }
    const diary = [...entries]
      .reverse()
      .map((e) => `### ${e.day}${e.mood ? ` (mood ${e.mood}/5)` : ''}\n${e.content}`)
      .join('\n\n');
    const numbers = cards.map(({ module, key, value, format, currency, detailParams }) => ({
      module,
      key,
      value,
      format,
      currency,
      detail: detailParams,
    }));
    return this.ai.complete(
      userId,
      WEEKLY_INSTRUCTION,
      `## Diary\n${diary || '(no entries)'}\n\n## The week in numbers\n${JSON.stringify(numbers)}`,
      'diary',
    );
  }

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
