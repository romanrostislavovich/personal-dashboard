import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalDate } from '@pd/contracts';
import { AppConfig } from '../config/env';
import { coreMessages } from '../i18n/core.messages';
import { NotificationsService } from '../notifications/notifications.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { UsersService } from '../users/users.service';
import { AiConnectionsService } from './ai-connections.service';
import { AiService } from './ai.service';
import { DigestChange } from './digest-changes';
import { MorningDigestService } from './morning-digest.service';

export const MORNING_DIGEST_INSTRUCTION = [
  "You write the user's morning digest for Telegram. You get JSON: today's date and sections,",
  "each with a `description`, today's `facts` and `previous` — the facts of the previous digest",
  '(null — the section is new). Start with the weather and what to wear, a sentence or two.',
  'For every other section tell only what changed compared to `previous`: new stars, a site that',
  'went down or came back, a new release, a birthday this week, a payment charged — with numbers,',
  'e.g. "⭐ owner/repo: +3 (125)". Do not repeat what has not changed.',
  'Short bullet points with emoji, no greeting or heading, plain text without markdown.',
  'Use only the given facts and never make things up.',
  // A model mixed them up: last week's artist came back as this week's news.
  "Every name, number and event you tell comes from today's `facts`; `previous` is only to",
  'compare with — never tell something from `previous` as news. A fact that is null means',
  'there is nothing to tell about it.',
].join(' ');

/** What the model gets: today's date and, for each section, its facts and the previous ones. */
export function digestRequest(
  today: string,
  changes: Pick<DigestChange, 'section' | 'facts' | 'previous'>[],
): string {
  return JSON.stringify({
    today,
    sections: changes.map(({ section, facts, previous }) => ({
      id: section.id,
      description: section.description,
      facts,
      previous,
    })),
  });
}

/**
 * The morning digest for users who enabled it in the AI settings, at the time each of them
 * chose: the weather and what changed since the previous digest (sections come from modules,
 * see DigestSection). The job looks every few minutes whose time has come.
 *
 * The ids of the job and of its schedule stay as they were when it ran once a day.
 */
@Injectable()
export class MorningDigestJob implements OnModuleInit {
  private readonly logger = new Logger(MorningDigestJob.name);

  constructor(
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly ai: AiService,
    private readonly digest: MorningDigestService,
    private readonly connections: AiConnectionsService,
    private readonly scheduler: SchedulerService,
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'ai.morning-digest',
      cron: '*/5 * * * *',
      handler: () => this.sendAll(),
    });
  }

  private async sendAll(): Promise<void> {
    for (const { userId, today } of await this.connections.usersWithDigestDue()) {
      // Marked before sending: a failing provider gets one attempt a day, not one every run.
      await this.connections.markDigestDay(userId, today);
      // One user's failing provider (no balance, a bad key) must not cancel everyone else's digest.
      await this.send(userId, today).catch((error) =>
        this.logger.error(`Morning digest failed for ${userId}: ${error}`),
      );
    }
  }

  /** Sends only when there is news: the weather alone is enough, an unchanged day is not. */
  private async send(userId: string, today: LocalDate): Promise<void> {
    const changes = await this.digest.changes(userId);
    if (changes.length === 0) {
      return;
    }
    const reply = await this.ai.complete(
      userId,
      MORNING_DIGEST_INSTRUCTION,
      digestRequest(today, changes),
    );
    await this.notifications.send(userId, {
      title: coreMessages((await this.users.findById(userId))?.locale).morningDigestTitle,
      body: reply,
      source: 'ai',
    });
    await this.digest.markSent(userId, changes);
  }
}
