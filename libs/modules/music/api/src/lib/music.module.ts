import { Module } from '@nestjs/common';
import { MusicSearch } from './music.search';
import { MusicAiTools } from './music.ai-tools';
import { MusicDigest } from './music.digest';
import { MusicAchievements } from './music.achievements';
import { LastfmHistoryImport } from './lastfm-history.import';
import { LastfmSyncJob } from './lastfm-sync.job';
import { LastfmService } from './lastfm.service';
import { MusicController } from './music.controller';
import { MusicServerActions } from './music.server-actions';
import { MusicHistoryStatsService } from './music-history.stats';
import { SoundcloudAchievements } from './soundcloud/soundcloud.achievements';
import { SoundcloudAiTools } from './soundcloud/soundcloud.ai-tools';
import { SoundcloudController } from './soundcloud/soundcloud.controller';
import { SoundcloudDigest } from './soundcloud/soundcloud.digest';
import { SoundcloudJob } from './soundcloud/soundcloud.job';
import { SoundcloudServerActions } from './soundcloud/soundcloud.server-actions';
import { SoundcloudService } from './soundcloud/soundcloud.service';
import { SpotifyService } from './spotify.service';

/**
 * Music: the whole Last.fm history stored locally and kept up to date, tops from Last.fm,
 * "now playing" from Spotify, and the user's own tracks on SoundCloud (`soundcloud/`).
 * API: `/api/music/*`.
 */
@Module({
  controllers: [MusicController, SoundcloudController],
  providers: [
    MusicSearch,
    LastfmService,
    LastfmHistoryImport,
    SpotifyService,
    LastfmSyncJob,
    MusicHistoryStatsService,
    MusicAchievements,
    MusicAiTools,
    MusicDigest,
    MusicServerActions,
    SoundcloudService,
    SoundcloudJob,
    SoundcloudAchievements,
    SoundcloudAiTools,
    SoundcloudDigest,
    SoundcloudServerActions,
  ],
})
export class MusicModule {}
