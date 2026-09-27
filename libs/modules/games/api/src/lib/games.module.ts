import { Module } from '@nestjs/common';
import { GamesAiTools } from './games.ai-tools';
import { GamesAchievements } from './games.achievements';
import { DotaService } from './dota/dota.service';
import { GameAccountsService } from './game-accounts.service';
import { GamesSyncJob } from './games-sync.job';
import { GamesController } from './games.controller';
import { WowService } from './wow/wow.service';

/**
 * Игры: Dota 2 (OpenDota) и World of Warcraft (Battle.net API).
 * API: `/api/games/*`.
 */
@Module({
  controllers: [GamesController],
  providers: [
    GameAccountsService,
    DotaService,
    WowService,
    GamesSyncJob,
    GamesAchievements,
    GamesAiTools,
  ],
})
export class GamesModule {}
