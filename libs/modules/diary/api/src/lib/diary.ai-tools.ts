import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS, PERIOD_PARAMETERS } from '@pd/api-core';
import { DiaryService } from './diary.service';

/** AI access to the diary: entries for a period and statistics. */
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
  }
}
