import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS, PERIOD_PARAMETERS } from '@pd/api-core';
import { DiaryService } from './diary.service';

/** Доступ AI к дневнику: записи за период и статистика. */
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
        'Записи дневника за период: дата, настроение 1–5, теги и текст (markdown). ' +
        'Для вопросов о прошедших днях, событиях, настроении.',
      parameters: PERIOD_PARAMETERS,
      handler: (userId, args) =>
        this.diary.list(userId, { from: String(args['from']), to: String(args['to']) }),
    });

    this.ai.registerTool({
      name: 'diary_stats',
      module: 'diary',
      description:
        'Статистика дневника: текущая и рекордная серия дней, число записей, есть ли запись сегодня, ' +
        'настроение за 30 дней, частые теги.',
      parameters: NO_PARAMETERS,
      handler: (userId) => this.diary.stats(userId),
    });
  }
}
