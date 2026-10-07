import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS, PERIOD_PARAMETERS, ServerActions } from '@pd/api-core';
import { moodInsightsQuerySchema, MUSIC_TOP_PERIODS, MusicTopPeriod } from '@pd/contracts';
import { LastfmService } from './lastfm.service';
import { HISTORY_GROUPS, historyTopSchema, MusicHistoryQueryService } from './music-history.query';
import { MusicLinks } from './music.links';
import { MUSIC_ACTIONS } from './music.server-actions';

/**
 * AI access to music: Last.fm statistics and tops, questions to the stored play history;
 * refreshing them (assistant).
 */
@Injectable()
export class MusicAiTools implements OnModuleInit {
  constructor(
    private readonly actions: ServerActions,
    private readonly ai: AiService,
    private readonly lastfm: LastfmService,
    private readonly history: MusicHistoryQueryService,
    private readonly links: MusicLinks,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'music_mood_artists',
      module: 'music',
      description:
        'Who the user listens to on the days of a good mood (4–5 in the diary) and on the bad ' +
        'ones (1–2): for each side the artists played on a larger share of such days than of ' +
        'the other kind — days, plays, share of the days in percent. Useful for "what do I ' +
        'listen to when I feel good / bad". It shows what goes together, not what lifts a ' +
        'mood. Use a long period (three months and more).',
      parameters: PERIOD_PARAMETERS,
      handler: (userId, args) =>
        this.links.moodArtists(userId, moodInsightsQuerySchema.parse(args)),
    });

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
      description:
        'The overall top artists, tracks and albums of a fixed period, as Last.fm counts them ' +
        '(the first few of each). It cannot be narrowed to one artist or to dates: for that ' +
        'use music_history_top.',
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

    this.ai.registerTool({
      name: 'music_history_top',
      module: 'music',
      description:
        'The most played tracks, artists or albums in the whole stored play history, counted ' +
        'from every play. Use it whenever the question is about one artist, track or album ' +
        '("my top 5 songs of Muse", "which album of X did I play most", "how many times did I ' +
        'play Y") or about dates ("what I listened to in 2024"). `by` — what to count by; ' +
        '`artist`, `track`, `album` narrow the plays (the case does not matter, a part of the ' +
        'name works when nothing matches exactly); `from` and `to` are days, inclusive. ' +
        'Returns `plays` — all plays that match — and the rows with their plays and the first ' +
        'and last time played.',
      parameters: {
        type: 'object',
        properties: {
          by: { type: 'string', enum: [...HISTORY_GROUPS], description: 'Default: track' },
          artist: { type: 'string' },
          track: { type: 'string' },
          album: { type: 'string' },
          from: { type: 'string', description: 'YYYY-MM-DD' },
          to: { type: 'string', description: 'YYYY-MM-DD' },
          limit: { type: 'number', description: '1–50, default 10' },
        },
      },
      handler: (userId, args) => this.history.top(userId, historyTopSchema.parse(args)),
    });

    this.ai.registerTool({
      name: 'music_sync',
      module: 'music',
      writes: true,
      description: 'Loads the latest plays from Last.fm now instead of waiting for the sync.',
      parameters: NO_PARAMETERS,
      handler: async (userId) => {
        await this.actions.run(userId, MUSIC_ACTIONS.syncLastfm);
        return this.lastfm.stats(userId);
      },
    });
  }
}
