import { birthdaysModule } from '@pd/birthdays-web';
import { financeModule } from '@pd/finance-web';
import { githubOssModule } from '@pd/github-oss-web';
import { monitoringModule } from '@pd/monitoring-web';
import { WebDashboardModule } from '@pd/web-core';

/**
 * Включённые модули дашборда (web-часть). Порядок = порядок в меню и на главной.
 * Чтобы отключить модуль — убери его отсюда и из apps/api/src/modules.ts.
 */
export const enabledModules: WebDashboardModule[] = [
  birthdaysModule,
  financeModule,
  monitoringModule,
  githubOssModule,
];
