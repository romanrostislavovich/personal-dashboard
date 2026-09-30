import { Module } from '@nestjs/common';
import { GamesAiTools } from './games.ai-tools';
import { GamesDigest } from './games.digest';
import { GamesAchievements } from './games.achievements';
import { DotaAchievements } from './dota/dota.achievements';
import { DotaCareerService } from './dota/dota-career.service';
import { DotaHeroesService } from './dota/dota-heroes.service';
import { DotaOverviewService } from './dota/dota-overview.service';
import { DotaService } from './dota/dota.service';
import { GameAccountsService } from './game-accounts.service';
import { GamesSyncJob } from './games-sync.job';
import { GamesController } from './games.controller';
import { GamesServerActions } from './games.server-actions';
import { WowService } from './wow/wow.service';

/**
 * Games: Dota 2 (OpenDota) and World of Warcraft (Battle.net API).
 * API: `/api/games/*`.
 */
@Module({
  controllers: [GamesController],
  providers: [
    GameAccountsService,
    DotaService,
    DotaHeroesService,
    DotaOverviewService,
    DotaCareerService,
    DotaAchievements,
    WowService,
    GamesSyncJob,
    GamesAchievements,
    GamesAiTools,
    GamesDigest,
    GamesServerActions,
  ],
})
export class GamesModule {}
