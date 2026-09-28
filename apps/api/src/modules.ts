import { BirthdaysModule } from '@pd/birthdays-api';
import { DiaryModule } from '@pd/diary-api';
import { FinanceModule } from '@pd/finance-api';
import { GamesModule } from '@pd/games-api';
import { GithubOssModule } from '@pd/github-oss-api';
import { MonitoringModule } from '@pd/monitoring-api';
import { MusicModule } from '@pd/music-api';
import { WeatherModule } from '@pd/weather-api';

/**
 * Enabled dashboard modules (backend part).
 * To disable a module, remove it from this list (and from apps/web/src/app/modules.ts).
 */
export const enabledModules = [
  BirthdaysModule,
  FinanceModule,
  GithubOssModule,
  MonitoringModule,
  DiaryModule,
  MusicModule,
  GamesModule,
  WeatherModule,
];
