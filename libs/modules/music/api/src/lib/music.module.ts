import { Module } from '@nestjs/common';
import { MusicAiTools } from './music.ai-tools';
import { MusicDigest } from './music.digest';
import { MusicAchievements } from './music.achievements';
import { LastfmHistoryImport } from './lastfm-history.import';
import { LastfmSyncJob } from './lastfm-sync.job';
import { LastfmService } from './lastfm.service';
import { MusicController } from './music.controller';
import { MusicServerActions } from './music.server-actions';
import { MusicHistoryStatsService } from './music-history.stats';
import { SpotifyService } from './spotify.service';

/**
 * Music: the whole Last.fm history stored locally and kept up to date, tops from Last.fm,
 * "now playing" from Spotify. API: `/api/music/*`.
 */
@Module({
  controllers: [MusicController],
  providers: [
    LastfmService,
    LastfmHistoryImport,
    SpotifyService,
    LastfmSyncJob,
    MusicHistoryStatsService,
    MusicAchievements,
    MusicAiTools,
    MusicDigest,
    MusicServerActions,
  ],
})
export class MusicModule {}
