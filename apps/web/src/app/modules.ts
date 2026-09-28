import { achievementsModule } from '@pd/achievements-web';
import { aiModule } from '@pd/ai-web';
import { birthdaysModule } from '@pd/birthdays-web';
import { diaryModule } from '@pd/diary-web';
import { financeModule } from '@pd/finance-web';
import { gamesModule } from '@pd/games-web';
import { githubOssModule } from '@pd/github-oss-web';
import { monitoringModule } from '@pd/monitoring-web';
import { musicModule } from '@pd/music-web';
import { weatherModule } from '@pd/weather-web';
import { WebDashboardModule } from '@pd/web-core';

/**
 * Enabled dashboard modules (web part). Order = order in the menu and on the home page.
 * To disable a module, remove it from here and from apps/api/src/modules.ts.
 */
// Narrow and wide widgets alternate so the home grid fills without gaps.
export const enabledModules: WebDashboardModule[] = [
  aiModule,
  weatherModule,
  diaryModule,
  financeModule,
  birthdaysModule,
  githubOssModule,
  monitoringModule,
  musicModule,
  gamesModule,
  achievementsModule,
];
