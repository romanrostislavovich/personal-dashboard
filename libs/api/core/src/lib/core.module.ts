import { Controller, Get, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AchievementsController } from './achievements/achievements.controller';
import { AchievementsService } from './achievements/achievements.service';
import { AiConnectionsService } from './ai/ai-connections.service';
import { AiController } from './ai/ai.controller';
import { AiTelegramAssistant } from './ai/ai-telegram.assistant';
import { CoreAiTools } from './ai/core.ai-tools';
import { MorningDigestJob } from './ai/morning-digest.job';
import { AiService } from './ai/ai.service';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
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
import { SecretsService } from './secrets/secrets.service';
import { SyncClient } from './sync/sync-client.service';
import { SyncController } from './sync/sync.controller';
import { SyncService } from './sync/sync.service';
import { SyncStore } from './sync/sync-store';
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
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [
    HealthController,
    AuthController,
    ProjectsController,
    NotificationsController,
    AchievementsController,
    AiController,
    RealtimeController,
    SyncController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: UserActivityInterceptor },
    AuthService,
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
    CoreAiTools,
    AiTelegramAssistant,
    MorningDigestJob,
    SyncStore,
    SyncService,
    SyncClient,
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
  ],
})
export class CoreModule {}
