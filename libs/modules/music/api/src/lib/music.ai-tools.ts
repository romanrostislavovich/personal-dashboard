import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS } from '@pd/api-core';
import { MUSIC_TOP_PERIODS, MusicTopPeriod } from '@pd/contracts';
import { LastfmService } from './lastfm.service';

/** AI access to music: Last.fm statistics and tops. */
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
      description: 'Plays: today, per day over 30 days, total scrobbles, the last 10 tracks.',
      parameters: NO_PARAMETERS,
      handler: (userId) => this.lastfm.stats(userId),
    });

    this.ai.registerTool({
      name: 'music_tops',
      module: 'music',
      description: 'Top artists, tracks and albums for a period (from Last.fm).',
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
