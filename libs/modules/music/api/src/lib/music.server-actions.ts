import { Injectable, OnModuleInit } from '@nestjs/common';
import { ServerActions } from '@pd/api-core';
import { lastfmSettingsInputSchema } from '@pd/contracts';
import { LastfmHistoryImport } from './lastfm-history.import';
import { LastfmService } from './lastfm.service';

/** Last.fm requests run on the server (see ServerActions). */
export const MUSIC_ACTIONS = {
  connectLastfm: 'music.connect-lastfm',
  importHistory: 'music.import-history',
  syncLastfm: 'music.sync-lastfm',
} as const;

@Injectable()
export class MusicServerActions implements OnModuleInit {
  constructor(
    private readonly actions: ServerActions,
    private readonly lastfm: LastfmService,
    private readonly history: LastfmHistoryImport,
  ) {}

  onModuleInit(): void {
    // Connects and starts importing the whole history in the background.
    this.actions.register(MUSIC_ACTIONS.connectLastfm, async (userId, args) => {
      await this.lastfm.connect(userId, lastfmSettingsInputSchema.parse(args));
      this.history.start(userId);
    });
    // Starts in the background on the server; the plays arrive with the regular sync.
    this.actions.register(MUSIC_ACTIONS.importHistory, async (userId) => {
      this.history.start(userId);
    });
    this.actions.register(MUSIC_ACTIONS.syncLastfm, (userId) => this.lastfm.sync(userId));
  }
}
