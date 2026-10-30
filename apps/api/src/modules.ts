import {BirthdaysModule} from '@pd/birthdays-api';
import {DiaryModule} from '@pd/diary-api';
import {FinanceModule} from '@pd/finance-api';
import {GamesModule} from '@pd/games-api';
import {HealthModule} from '@pd/health-api';
import {DevelopmentModule} from '@pd/development-api';
import {MonitoringModule} from '@pd/monitoring-api';
import {MoviesModule} from '@pd/movies-api';
import {MusicModule} from '@pd/music-api';
import {PsychologyModule} from '@pd/psychology-api';
import {ActivityModule} from '@pd/activity-api';
import {ScreenshotsModule} from '@pd/screenshots-api';
import {TasksModule} from '@pd/tasks-api';
import {VaultModule} from '@pd/vault-api';
import {HabitsModule} from '@pd/habits-api';
import {WeatherModule} from '@pd/weather-api';
import {WritingModule} from '@pd/writing-api';

/**
 * Enabled dashboard modules (backend part).
 * To disable a module, remove it from this list (and from apps/web/src/app/modules.ts).
 */
export const enabledModules = [
  TasksModule,
  ActivityModule,
  BirthdaysModule,
  FinanceModule,
  DevelopmentModule,
  MonitoringModule,
  DiaryModule,
  PsychologyModule,
  HealthModule,
  VaultModule,
  HabitsModule,
  MusicModule,
  MoviesModule,
  GamesModule,
  WeatherModule,
  WritingModule,
  ScreenshotsModule,
];
