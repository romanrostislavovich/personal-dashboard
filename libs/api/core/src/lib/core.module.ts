import { Controller, Get, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AchievementsController } from './achievements/achievements.controller';
import { AchievementsService } from './achievements/achievements.service';
import { AiConnectionsService } from './ai/ai-connections.service';
import { AiController } from './ai/ai.controller';
import { AiTelegramAssistant } from './ai/ai-telegram.assistant';
import { AiActionsService } from './ai/ai-actions.service';
import { AiConversationsService } from './ai/ai-conversations.service';
import { CoreAiTools } from './ai/core.ai-tools';
import { MorningDigestJob } from './ai/morning-digest.job';
import { MorningDigestService } from './ai/morning-digest.service';
import { AiService } from './ai/ai.service';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { TrashController } from './trash/trash.controller';
import { TrashService } from './trash/trash.service';
import { SessionsService } from './auth/sessions.service';
import { TwoFactorService } from './auth/two-factor.service';
import { AuthService } from './auth/auth.service';
import { Public } from './auth/public.decorator';
import { AppConfig, validateEnv } from './config/env';
import { DatabaseModule } from './database/database.module';
import { NOTIFICATION_CHANNELS, NotificationChannel } from './notifications/notification-channel';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { TelegramBotService } from './notifications/telegram/telegram-bot.service';
import { TelegramChannel } from './notifications/telegram/telegram.channel';
import { ProjectsController } from './projects/projects.controller';
import { ProjectsService } from './projects/projects.service';
import { SchedulerService } from './scheduler/scheduler.service';
import { LifeMonthJob } from './life/life-month.job';
import { LifeController } from './life/life.controller';
import { LifeService } from './life/life.service';
import { AutomationsController } from './automations/automations.controller';
import { AutomationsService } from './automations/automations.service';
import { CoreAutomations } from './automations/core.automations';
import { AchievementsLife } from './life/achievements.life';
import { LifeGoalsService } from './life/life-goals.service';
import { LifeStoriesService } from './life/life-stories.service';
import { SearchController } from './search/search.controller';
import { SearchService } from './search/search.service';
import { SecretsService } from './secrets/secrets.service';
import { JobRunsService } from './system/job-runs.service';
import { SystemController } from './system/system.controller';
import { SystemLogService } from './system/system-log.service';
import { UnhandledErrorsFilter } from './system/unhandled-errors.filter';
import { ServerActions } from './sync/server-actions';
import { SyncClient } from './sync/sync-client.service';
import { SyncController } from './sync/sync.controller';
import { SyncService } from './sync/sync.service';
import { SyncStore } from './sync/sync-store';
import { SyncConflictsService } from './sync/sync-conflicts.service';
import { BackupService } from './backup/backup.service';
import { UsersService } from './users/users.service';
import { InAppChannel } from './realtime/in-app.channel';
import { RealtimeController } from './realtime/realtime.controller';
import { RealtimeService } from './realtime/realtime.service';
import { UserActivityInterceptor } from './realtime/user-activity.interceptor';
import { UserActivityService } from './realtime/user-activity.service';

@Controller('health')
class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok' };
  }
}

/**
 * Core: config, database, auth, projects, scheduler, integration secrets, notifications,
 * realtime events for open dashboards, achievements, AI, sync between two instances.
 * The module is global — feature modules simply inject the services they need
 * (DB, SchedulerService, SecretsService, NotificationsService, UsersService).
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: AppConfig) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        // Every token sets its own lifetime (see AuthService); this is only a safety net.
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [
    HealthController,
    AuthController,
    TrashController,
    ProjectsController,
    NotificationsController,
    AchievementsController,
    AiController,
    RealtimeController,
    SyncController,
    SystemController,
    SearchController,
    LifeController,
    AutomationsController,
  ],
  providers: [
    SearchService,
    LifeService,
    LifeMonthJob,
    AutomationsService,
    CoreAutomations,
    AchievementsLife,
    LifeGoalsService,
    LifeStoriesService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: UserActivityInterceptor },
    AuthService,
    SessionsService,
    TrashService,
    TwoFactorService,
    UsersService,
    ProjectsService,
    SchedulerService,
    SecretsService,
    NotificationsService,
    TelegramBotService,
    TelegramChannel,
    RealtimeService,
    UserActivityService,
    InAppChannel,
    AchievementsService,
    AiService,
    AiConnectionsService,
    AiConversationsService,
    AiActionsService,
    CoreAiTools,
    AiTelegramAssistant,
    MorningDigestService,
    MorningDigestJob,
    SyncStore,
    SyncService,
    SyncClient,
    ServerActions,
    SyncConflictsService,
    BackupService,
    JobRunsService,
    SystemLogService,
    // Errors nobody caught are logged with their request (see the filter).
    { provide: APP_FILTER, useClass: UnhandledErrorsFilter },
    // New channels (Discord, e-mail…) are added to this list.
    {
      provide: NOTIFICATION_CHANNELS,
      inject: [TelegramChannel, InAppChannel],
      useFactory: (...channels: NotificationChannel[]) => channels,
    },
  ],
  exports: [
    UsersService,
    ProjectsService,
    SchedulerService,
    SecretsService,
    NotificationsService,
    // For bot commands: modules register them via registerCommand().
    TelegramBotService,
    // For achievements: modules register their metrics via register().
    AchievementsService,
    // For AI: modules expose their data via registerTool().
    AiService,
    // For the morning digest: modules add their sections via register().
    MorningDigestService,
    // For the command palette: modules register their search via register().
    SearchService,
    LifeService,
    AutomationsService,
    // For actions that reach outside services: they run on the server (see ServerActions).
    ServerActions,
  ],
})
export class CoreModule {}
