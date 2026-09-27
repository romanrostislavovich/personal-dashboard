import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS } from '@pd/api-core';
import { MUSIC_TOP_PERIODS, MusicTopPeriod } from '@pd/contracts';
import { LastfmService } from './lastfm.service';

/** Доступ AI к музыке: статистика и топы Last.fm. */
@Injectable()
export class MusicAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly lastfm: LastfmService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'music_stats',
      module: 'music',
      description:
        'Прослушивания: сегодня, по дням за 30 дней, всего скробблов, 10 последних треков.',
      parameters: NO_PARAMETERS,
      handler: (userId) => this.lastfm.stats(userId),
    });

    this.ai.registerTool({
      name: 'music_tops',
      module: 'music',
      description: 'Топ артистов, треков и альбомов за период (из Last.fm).',
      parameters: {
        type: 'object',
        properties: { period: { type: 'string', enum: [...MUSIC_TOP_PERIODS] } },
        required: ['period'],
      },
      handler: (userId, args) => {
        const period = MUSIC_TOP_PERIODS.includes(args['period'] as MusicTopPeriod)
          ? (args['period'] as MusicTopPeriod)
          : '7day';
        return this.lastfm.tops(userId, period);
      },
    });
  }
}
