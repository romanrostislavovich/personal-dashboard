import { Injectable, OnModuleInit } from '@nestjs/common';
import { AchievementsService } from '../achievements/achievements.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TelegramBotService } from '../notifications/telegram/telegram-bot.service';
import { ProjectsService } from '../projects/projects.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { NO_PARAMETERS } from './ai-tool';
import { AiService } from './ai.service';

/** Telegram ограничивает сообщение 4096 символами. */
const TELEGRAM_LIMIT = 4000;

const MORNING_DIGEST_PROMPT = [
  'Составь мой утренний дайджест на сегодня. Собери данные инструментами:',
  'ближайшие дни рождения (сегодня и на неделе), статус сайтов и сбои,',
  'регулярные платежи и расходы за текущий месяц, новое в open source,',
  'серию в дневнике. Коротко, по пунктам с эмодзи, только важное; пустые разделы пропусти.',
].join(' ');

/**
 * Связь AI с остальным ядром:
 * - инструменты ядра (проекты, ачивки);
 * - команда бота `/ask вопрос`;
 * - утренний дайджест в 08:30 для тех, кто его включил.
 */
@Injectable()
export class AiIntegrations implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly telegram: TelegramBotService,
    private readonly scheduler: SchedulerService,
    private readonly notifications: NotificationsService,
    private readonly projects: ProjectsService,
    private readonly achievements: AchievementsService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'core_projects',
      module: 'projects',
      description: 'Проекты пользователя (сайты и сервисы): название, адрес, описание.',
      parameters: NO_PARAMETERS,
      handler: (userId) => this.projects.list(userId),
    });
    this.ai.registerTool({
      name: 'core_achievements',
      module: 'achievements',
      description: 'Личные ачивки: открытые (unlockedAt) и прогресс по остальным.',
      parameters: NO_PARAMETERS,
      handler: async (userId) =>
        (await this.achievements.list(userId)).map(({ title, progress, goal, unlockedAt }) => ({
          title,
          progress,
          goal,
          unlockedAt,
        })),
    });

    this.telegram.registerCommand({
      command: 'ask',
      description: 'Вопрос AI по твоим данным: /ask сколько я потратил в сентябре?',
      handler: async (user, question) => {
        if (!question) {
          return 'Напиши вопрос после команды, например: /ask какие дни рождения на этой неделе?';
        }
        if (!(await this.ai.isConfigured(user.id))) {
          return 'AI не настроен: открой раздел «AI» в дашборде и укажи ключ.';
        }
        const { reply } = await this.ai.ask(user.id, [{ role: 'user', content: question }], {
          plainText: true,
        });
        return reply.slice(0, TELEGRAM_LIMIT);
      },
    });

    this.scheduler.register({
      name: 'ai.morning-digest',
      cron: '30 8 * * *',
      handler: () => this.sendMorningDigests(),
    });
  }

  private async sendMorningDigests(): Promise<void> {
    for (const userId of await this.ai.usersWithMorningDigest()) {
      const { reply } = await this.ai.ask(
        userId,
        [{ role: 'user', content: MORNING_DIGEST_PROMPT }],
        {
          plainText: true,
        },
      );
      await this.notifications.send(userId, {
        title: '☀️ Доброе утро',
        body: reply.slice(0, TELEGRAM_LIMIT),
        source: 'ai',
      });
    }
  }
}
