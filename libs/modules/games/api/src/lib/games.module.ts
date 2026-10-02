import { Module } from '@nestjs/common';
import { GamesSearch } from './games.search';
import { GamesAiTools } from './games.ai-tools';
import { GamesDigest } from './games.digest';
import { GamesAchievements } from './games.achievements';
import { DotaAchievements } from './dota/dota.achievements';
import { DotaCareerService } from './dota/dota-career.service';
import { DotaHeroesService } from './dota/dota-heroes.service';
import { DotaOverviewService } from './dota/dota-overview.service';
import { DotaService } from './dota/dota.service';
import { DotaSteamSource } from './dota/dota-steam.source';
import { OpenDotaKeyService } from './dota/opendota-key.service';
import { GameAccountsService } from './game-accounts.service';
import { GamesSyncJob } from './games-sync.job';
import { GamesController } from './games.controller';
import { GamesServerActions } from './games.server-actions';
import { SteamAchievements } from './steam/steam.achievements';
import { SteamKeyService } from './steam/steam-key.service';
import { SteamService } from './steam/steam.service';
import { WowService } from './wow/wow.service';

/**
 * Games: Steam (profile and library), Dota 2 (Steam, complemented by OpenDota) and World of
 * Warcraft (Battle.net API).
 * API: `/api/games/*`.
 */
@Module({
  controllers: [GamesController],
  providers: [
    GamesSearch,
    GameAccountsService,
    DotaService,
    DotaHeroesService,
    DotaSteamSource,
    OpenDotaKeyService,
    DotaOverviewService,
    DotaCareerService,
    DotaAchievements,
    WowService,
    SteamKeyService,
    SteamService,
    SteamAchievements,
    GamesSyncJob,
    GamesAchievements,
    GamesAiTools,
    GamesDigest,
    GamesServerActions,
  ],
})
export class GamesModule {}
