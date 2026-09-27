import { Module } from '@nestjs/common';
import { GamesAiTools } from './games.ai-tools';
import { GamesAchievements } from './games.achievements';
import { DotaAchievements } from './dota/dota.achievements';
import { DotaCareerService } from './dota/dota-career.service';
import { DotaService } from './dota/dota.service';
import { GameAccountsService } from './game-accounts.service';
import { GamesSyncJob } from './games-sync.job';
import { GamesController } from './games.controller';
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
    DotaCareerService,
    DotaAchievements,
    WowService,
    GamesSyncJob,
    GamesAchievements,
    GamesAiTools,
  ],
})
export class GamesModule {}
