import { Injectable, OnModuleInit } from '@nestjs/common';
import { AchievementsService } from '../achievements/achievements.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TelegramBotService } from '../notifications/telegram/telegram-bot.service';
import { ProjectsService } from '../projects/projects.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { coreMessages } from '../i18n/core.messages';
import { UsersService } from '../users/users.service';
import { NO_PARAMETERS } from './ai-tool';
import { AiService } from './ai.service';

/** Telegram limits a message to 4096 characters. */
const TELEGRAM_LIMIT = 4000;

const MORNING_DIGEST_PROMPT = [
  'Make my morning digest for today. Collect data with the tools:',
  'upcoming birthdays (today and this week), website status and failures,',
  'recurring payments and spending this month, open source news, diary streak.',
  'Short bullet points with emoji, only what matters; skip empty sections.',
].join(' ');

/**
 * Wires the AI into the rest of the core:
 * - core tools (projects, achievements);
 * - the bot command `/ask question`;
 * - the morning digest at 08:30 for users who enabled it.
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
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'core_projects',
      module: 'projects',
      description: "The user's projects (sites and services): name, URL, description.",
      parameters: NO_PARAMETERS,
      handler: (userId) => this.projects.list(userId),
    });
    this.ai.registerTool({
      name: 'core_achievements',
      module: 'achievements',
      description: 'Personal achievements: unlocked ones (unlockedAt) and progress on the rest.',
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
      description: { en: coreMessages('en').askDescription, ru: coreMessages('ru').askDescription },
      handler: async (user, question) => {
        const text = coreMessages(user.locale);
        if (!question) {
          return text.askUsage;
        }
        if (!(await this.ai.isConfigured(user.id))) {
          return text.askNotConfigured;
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
        title: coreMessages((await this.users.findById(userId))?.locale).morningDigestTitle,
        body: reply.slice(0, TELEGRAM_LIMIT),
        source: 'ai',
      });
    }
  }
}
