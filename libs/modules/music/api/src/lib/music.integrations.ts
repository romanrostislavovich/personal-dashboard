import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, IntegrationsService } from '@pd/api-core';
import { eq } from 'drizzle-orm';
import { musicSettings } from './music.schema';
import { soundcloudAccounts } from './soundcloud/soundcloud.schema';
import { SpotifyService } from './spotify.service';

/** Last.fm is asked every quarter of an hour, SoundCloud every hour. */
const STALE_HOURS = 12;

/** The connections of Music in the list of integrations: Last.fm, Spotify, SoundCloud. */
@Injectable()
export class MusicIntegrations implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly integrations: IntegrationsService,
    private readonly spotify: SpotifyService,
  ) {}

  onModuleInit(): void {
    this.integrations.register({
      id: 'music.lastfm',
      module: 'music',
      staleHours: STALE_HOURS,
      reports: async (userId) => {
        const [settings] = await this.db
          .select()
          .from(musicSettings)
          .where(eq(musicSettings.userId, userId));
        return settings?.lastfmUsername
          ? [
              {
                name: 'Last.fm',
                detail: settings.lastfmUsername,
                lastSyncedAt: settings.lastSyncedAt,
                error: settings.lastError,
              },
            ]
          : [];
      },
    });

    this.integrations.register({
      id: 'music.spotify',
      module: 'music',
      // "Now playing" is asked when the page is open: there is no refresh to be late.
      reports: async (userId) =>
        (await this.spotify.isConnected(userId)) ? [{ name: 'Spotify' }] : [],
    });

    this.integrations.register({
      id: 'music.soundcloud',
      module: 'music',
      staleHours: STALE_HOURS,
      reports: async (userId) => {
        const [account] = await this.db
          .select()
          .from(soundcloudAccounts)
          .where(eq(soundcloudAccounts.userId, userId));
        return account
          ? [
              {
                name: 'SoundCloud',
                detail: account.username,
                lastSyncedAt: account.lastSyncedAt,
                error: account.lastError,
              },
            ]
          : [];
      },
    });
  }
}
