import { achievementsModule } from '@pd/achievements-web';
import { aiModule } from '@pd/ai-web';
import { birthdaysModule } from '@pd/birthdays-web';
import { diaryModule } from '@pd/diary-web';
import { financeModule } from '@pd/finance-web';
import { gamesModule } from '@pd/games-web';
import { githubOssModule } from '@pd/github-oss-web';
import { monitoringModule } from '@pd/monitoring-web';
import { musicModule } from '@pd/music-web';
import { WebDashboardModule } from '@pd/web-core';

/**
 * Включённые модули дашборда (web-часть). Порядок = порядок в меню и на главной.
 * Чтобы отключить модуль — убери его отсюда и из apps/api/src/modules.ts.
 */
// Узкие и широкие виджеты чередуются, чтобы сетка главной заполнялась без пустот.
export const enabledModules: WebDashboardModule[] = [
  aiModule,
  diaryModule,
  financeModule,
  birthdaysModule,
  githubOssModule,
  monitoringModule,
  musicModule,
  gamesModule,
  achievementsModule,
];
