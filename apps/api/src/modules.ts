import { BirthdaysModule } from '@pd/birthdays-api';
import { DiaryModule } from '@pd/diary-api';
import { FinanceModule } from '@pd/finance-api';
import { GamesModule } from '@pd/games-api';
import { GithubOssModule } from '@pd/github-oss-api';
import { MonitoringModule } from '@pd/monitoring-api';
import { MusicModule } from '@pd/music-api';

/**
 * Включённые модули дашборда (бэкенд-часть).
 * Чтобы отключить модуль — убери его из списка (и из apps/web/src/app/modules.ts).
 */
export const enabledModules = [
  BirthdaysModule,
  FinanceModule,
  GithubOssModule,
  MonitoringModule,
  DiaryModule,
  MusicModule,
  GamesModule,
];
