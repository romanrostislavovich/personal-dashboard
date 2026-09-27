import { Module } from '@nestjs/common';
import { MusicAiTools } from './music.ai-tools';
import { MusicAchievements } from './music.achievements';
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
  providers: [LastfmService, SpotifyService, LastfmSyncJob, MusicAchievements, MusicAiTools],
})
export class MusicModule {}
