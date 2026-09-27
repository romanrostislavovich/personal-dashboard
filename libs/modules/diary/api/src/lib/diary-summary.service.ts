import { Injectable } from '@nestjs/common';
import { AiService } from '@pd/api-core';
import { DiaryQuery } from '@pd/contracts';
import { DiaryService } from './diary.service';

const INSTRUCTION = [
  'Ты помогаешь вести личный дневник. Сделай короткое тёплое саммари записей за период:',
  'главные события, как менялось настроение, повторяющиеся темы (по тегам), что получилось.',
  'В конце — одно мягкое наблюдение или вопрос для размышления. Пиши по-русски, на «ты»,',
  'до 150 слов, обычным текстом без markdown-разметки, без выдумок — только то, что есть в записях.',
].join(' ');

/** AI-саммари дневника за период. */
@Injectable()
export class DiarySummaryService {
  constructor(
    private readonly diary: DiaryService,
    private readonly ai: AiService,
  ) {}

  /** `null`, если за период нет записей — пересказывать нечего. */
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
      .map((e) => `### ${e.day}${e.mood ? ` (настроение ${e.mood}/5)` : ''}\n${e.content}`)
      .join('\n\n');
    return this.ai.complete(userId, INSTRUCTION, text);
  }
}
