import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { coreMessages } from '../i18n/core.messages';
import { NotificationsService } from '../notifications/notifications.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { UsersService } from '../users/users.service';
import { AiConnectionsService } from './ai-connections.service';
import { AiService } from './ai.service';

/** Telegram limits a message to 4096 characters. */
const TELEGRAM_LIMIT = 4000;

const MORNING_DIGEST_PROMPT = [
  'Make my morning digest for today. Collect data with the tools:',
  "today's weather and what to wear (start with it, a sentence or two),",
  'upcoming birthdays (today and this week), website status and failures,',
  'recurring payments and spending this month, open source news, diary streak.',
  'Short bullet points with emoji, only what matters; skip empty sections.',
].join(' ');

/** The morning digest at 08:30 for users who enabled it in the AI settings. */
@Injectable()
export class MorningDigestJob implements OnModuleInit {
  private readonly logger = new Logger(MorningDigestJob.name);

  constructor(
    private readonly ai: AiService,
    private readonly connections: AiConnectionsService,
    private readonly scheduler: SchedulerService,
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'ai.morning-digest',
      cron: '30 8 * * *',
      handler: () => this.sendAll(),
    });
  }

  private async sendAll(): Promise<void> {
    for (const userId of await this.connections.usersWithMorningDigest()) {
      // One user's failing provider (no balance, a bad key) must not cancel everyone else's digest.
      await this.send(userId).catch((error) =>
        this.logger.warn(`Morning digest failed for ${userId}: ${error}`),
      );
    }
  }

  private async send(userId: string): Promise<void> {
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
