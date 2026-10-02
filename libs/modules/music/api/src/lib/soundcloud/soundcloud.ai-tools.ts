import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS, ServerActions } from '@pd/api-core';
import { SOUNDCLOUD_ACTIONS } from './soundcloud.server-actions';
import { SoundcloudService } from './soundcloud.service';

/** AI access to the user's own SoundCloud tracks; refreshing them (assistant). */
@Injectable()
export class SoundcloudAiTools implements OnModuleInit {
  constructor(
    private readonly actions: ServerActions,
    private readonly ai: AiService,
    private readonly soundcloud: SoundcloudService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'soundcloud_tracks',
      module: 'music',
      description:
        "The user's own tracks and mixes on SoundCloud (they are the author): followers and " +
        'their growth over 7 days, totals of plays, likes, reposts and comments, growth of ' +
        'plays over 7 and 30 days, and every track with its counters, upload date, genre, ' +
        'whether it is private. `trackedSince` — the day the history starts: growth is known ' +
        'only from then. `null` — SoundCloud is not connected.',
      parameters: NO_PARAMETERS,
      handler: async (userId) => {
        const stats = await this.soundcloud.stats(userId);
        // The charts are of no use to the model.
        return (
          stats && {
            ...stats,
            history: undefined,
            avatarUrl: undefined,
            tracks: stats.tracks.map((track) => ({
              ...track,
              history: undefined,
              artworkUrl: undefined,
            })),
          }
        );
      },
    });

    this.ai.registerTool({
      name: 'soundcloud_sync',
      module: 'music',
      writes: true,
      description: 'Refreshes the SoundCloud counters now instead of waiting for the hourly sync.',
      parameters: NO_PARAMETERS,
      handler: async (userId) => {
        await this.actions.run(userId, SOUNDCLOUD_ACTIONS.sync);
        return { refreshed: true };
      },
    });
  }
}
