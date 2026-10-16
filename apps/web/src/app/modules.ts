import { achievementsModule } from '@pd/achievements-web';
import { activityModule } from '@pd/activity-web';
import { lifeModule } from '@pd/life-web';
import { securityModule } from '@pd/security-web';
import { aiModule } from '@pd/ai-web';
import { birthdaysModule } from '@pd/birthdays-web';
import { diaryModule } from '@pd/diary-web';
import { financeModule } from '@pd/finance-web';
import { gamesModule } from '@pd/games-web';
import { healthModule } from '@pd/health-web';
import { developmentModule } from '@pd/development-web';
import { monitoringModule } from '@pd/monitoring-web';
import { musicModule } from '@pd/music-web';
import { psychologyModule } from '@pd/psychology-web';
import { tasksModule } from '@pd/tasks-web';
import { vaultModule } from '@pd/vault-web';
import { habitsModule } from '@pd/habits-web';
import { weatherModule } from '@pd/weather-web';
import { writingModule } from '@pd/writing-web';
import { screenshotsModule } from '@pd/screenshots-web';
import { WebDashboardModule } from '@pd/web-core';

/**
 * Enabled dashboard modules (web part). Order = order in the menu and on the home page.
 * To disable a module, remove it from here and from apps/api/src/modules.ts.
 */
// Narrow and wide widgets alternate so the home grid fills without gaps.
export const enabledModules: WebDashboardModule[] = [
  aiModule,
  weatherModule,
  tasksModule,
  diaryModule,
  psychologyModule,
  healthModule,
  vaultModule,
  habitsModule,
  financeModule,
  writingModule,
  screenshotsModule,
  birthdaysModule,
  developmentModule,
  monitoringModule,
  musicModule,
  gamesModule,
  activityModule,
  lifeModule,
  securityModule,
  achievementsModule,
];
