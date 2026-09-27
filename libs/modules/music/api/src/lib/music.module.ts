import { Module } from '@nestjs/common';
import { LastfmSyncJob } from './lastfm-sync.job';
import { LastfmService } from './lastfm.service';
import { MusicController } from './music.controller';
import { SpotifyService } from './spotify.service';

/**
 * Музыка: история и топы из Last.fm, «сейчас играет» из Spotify.
 * API: `/api/music/*`.
 */
@Module({
  controllers: [MusicController],
  providers: [LastfmService, SpotifyService, LastfmSyncJob],
})
export class MusicModule {}
