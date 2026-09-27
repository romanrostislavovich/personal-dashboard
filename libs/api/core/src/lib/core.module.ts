import { Controller, Get, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AchievementsController } from './achievements/achievements.controller';
import { AchievementsService } from './achievements/achievements.service';
import { AiController } from './ai/ai.controller';
import { AiIntegrations } from './ai/ai.integrations';
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
import { UsersService } from './users/users.service';

@Controller('health')
class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok' };
  }
}

/**
 * Ядро: конфиг, БД, авторизация, проекты, планировщик, секреты интеграций, уведомления, ачивки, AI.
 * Модуль глобальный — модули-фичи просто инжектят нужные сервисы
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
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    AuthService,
    UsersService,
    ProjectsService,
    SchedulerService,
    SecretsService,
    NotificationsService,
    TelegramBotService,
    TelegramChannel,
    AchievementsService,
    AiService,
    AiIntegrations,
    // Новые каналы (Discord, e-mail…) добавляются в этот список.
    {
      provide: NOTIFICATION_CHANNELS,
      inject: [TelegramChannel],
      useFactory: (...channels: NotificationChannel[]) => channels,
    },
  ],
  exports: [
    UsersService,
    ProjectsService,
    SchedulerService,
    SecretsService,
    NotificationsService,
    // Для команд бота: модули регистрируют их через registerCommand().
    TelegramBotService,
    // Для ачивок: модули регистрируют свои метрики через register().
    AchievementsService,
    // Для AI: модули дают доступ к своим данным через registerTool().
    AiService,
  ],
})
export class CoreModule {}
