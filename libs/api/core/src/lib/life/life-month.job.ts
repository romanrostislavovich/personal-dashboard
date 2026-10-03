import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { addDays, parseLocalDate, toLocalDate, zonedDateTime } from '@pd/contracts';
import { eq } from 'drizzle-orm';
import { AiService } from '../ai/ai.service';
import { AppConfig } from '../config/env';
import { DB, Database } from '../database/database.module';
import { coreMessages } from '../i18n/core.messages';
import { NotificationsService } from '../notifications/notifications.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { users } from '../users/users.schema';
import { UsersService } from '../users/users.service';
import { lifeMonths } from './life.schema';
import { LifeService } from './life.service';

/** The summary of a month comes on the 1st, from this hour of the user's own clock. */
const SEND_FROM = '10:00';
const TELEGRAM_LIMIT = 4000;

const INSTRUCTION =
  "You get the numbers of the user's past month across a personal dashboard: each card has " +
  'a `key` (what it is, e.g. finance.life.spent), a `value`, its `format` and details. Write a ' +
  'warm, short summary of the month in 5–8 lines, like a "Wrapped": the highlights first, a ' +
  'little humour, no lists of every number, no advice. Plain text, emoji welcome.';

/**
 * On the 1st of a month: the summary of the past one, to every channel — a few lines from the
 * AI over the numbers of every module, and a link to the page with all of them. Without the AI
 * the message only invites to the page.
 */
@Injectable()
export class LifeMonthJob implements OnModuleInit {
  private readonly logger = new Logger(LifeMonthJob.name);
  private readonly publicUrl: string;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) config: AppConfig,
    private readonly scheduler: SchedulerService,
    private readonly life: LifeService,
    private readonly ai: AiService,
    private readonly notifications: NotificationsService,
    private readonly usersService: UsersService,
  ) {
    this.publicUrl = config.get('PUBLIC_URL', { infer: true });
  }

  onModuleInit(): void {
    this.scheduler.register({
      name: 'life.month-summary',
      cron: '15 * * * *',
      handler: () => this.sendAll(),
    });
  }

  private async sendAll(): Promise<void> {
    for (const { id } of await this.db.select({ id: users.id }).from(users)) {
      await this.sendIfDue(id).catch((error) =>
        this.logger.error(`Month summary failed for ${id}: ${error}`),
      );
    }
  }

  private async sendIfDue(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    const now = zonedDateTime(new Date(), this.usersService.timeZoneOf(user));
    if (!now.date.endsWith('-01') || now.time < SEND_FROM) {
      return;
    }
    const last = toLocalDate(addDays(parseLocalDate(now.date), -1));
    const month = last.slice(0, 7);
    const [sent] = await this.db.select().from(lifeMonths).where(eq(lifeMonths.userId, userId));
    if (sent?.month === month) {
      return;
    }
    // Marked first: one attempt a month, whatever happens next.
    await this.db
      .insert(lifeMonths)
      .values({ userId, month })
      .onConflictDoUpdate({ target: lifeMonths.userId, set: { month } });

    const cards = await this.life.period(userId, { from: `${month}-01`, to: last });
    if (!cards.length) {
      return;
    }
    const text = coreMessages(user?.locale);
    const link = `${this.publicUrl.replace(/\/+$/, '')}/life/summary?month=${month}`;
    // The AI sees only the modules the user lets it see (Settings → AI → privacy).
    const seen = await Promise.all(cards.map((card) => this.ai.canSee(userId, card.module)));
    const forAi = cards.filter((_, index) => seen[index]);
    const story =
      forAi.length && (await this.ai.isConfigured(userId))
        ? await this.ai
            .complete(userId, INSTRUCTION, JSON.stringify({ month, cards: forAi }))
            .catch(() => '')
        : '';
    await this.notifications.send(userId, {
      title: text.lifeMonthTitle(month),
      body: `${story ? `${story.slice(0, TELEGRAM_LIMIT)}\n\n` : ''}${text.lifeMonthLink} ${link}`,
      source: 'life',
    });
  }
}
