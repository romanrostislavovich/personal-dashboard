import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { addDays, parseLocalDate, toLocalDate, zonedDateTime } from '@pd/contracts';
import { eq } from 'drizzle-orm';
import { AppConfig } from '../config/env';
import { DB, Database } from '../database/database.module';
import { coreMessages } from '../i18n/core.messages';
import { NotificationsService } from '../notifications/notifications.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { users } from '../users/users.schema';
import { UsersService } from '../users/users.service';
import { LifeGoalsService } from './life-goals.service';
import { LifeStoriesService, periodRange } from './life-stories.service';
import { lifeMonths } from './life.schema';
import { LifeService } from './life.service';

/** The summaries come on the 1st, from this hour of the user's own clock. */
const SEND_FROM = '10:00';
const TELEGRAM_LIMIT = 4000;

/**
 * Every hour: the goals of the year just reached; on the 1st of a month the summary of the past
 * one (the AI's story, the modules' own lines like the finance review, a link to every number);
 * on the 1st of January the same for the past year. Without the AI a summary only invites to
 * the page.
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
    private readonly stories: LifeStoriesService,
    private readonly goals: LifeGoalsService,
    private readonly notifications: NotificationsService,
    private readonly usersService: UsersService,
  ) {
    this.publicUrl = config.get('PUBLIC_URL', { infer: true }).replace(/\/+$/, '');
  }

  onModuleInit(): void {
    this.scheduler.register({
      name: 'life.month-summary',
      cron: '15 * * * *',
      handler: () => this.runAll(),
    });
  }

  private async runAll(): Promise<void> {
    for (const { id } of await this.db.select({ id: users.id }).from(users)) {
      await this.run(id).catch((error) =>
        this.logger.error(`Life summary failed for ${id}: ${error}`),
      );
    }
  }

  private async run(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    const text = coreMessages(user?.locale);
    for (const goal of await this.goals.newlyDone(userId)) {
      await this.notifications.send(userId, {
        title: text.lifeGoalDoneTitle(goal.title),
        body: `${text.lifeGoalDoneBody} ${this.publicUrl}/life/goals`,
        source: 'life',
      });
    }

    const now = zonedDateTime(new Date(), this.usersService.timeZoneOf(user));
    if (!now.date.endsWith('-01') || now.time < SEND_FROM) {
      return;
    }
    const last = toLocalDate(addDays(parseLocalDate(now.date), -1));
    const month = last.slice(0, 7);
    const year = last.slice(0, 4);
    const [sent] = await this.db.select().from(lifeMonths).where(eq(lifeMonths.userId, userId));
    const monthDue = sent?.month !== month;
    const yearDue = now.date.endsWith('-01-01') && sent?.year !== year;
    if (!monthDue && !yearDue) {
      return;
    }
    // Marked first: one attempt each, whatever happens next.
    const marks = { month, year: yearDue ? year : (sent?.year ?? null) };
    await this.db
      .insert(lifeMonths)
      .values({ userId, ...marks })
      .onConflictDoUpdate({ target: lifeMonths.userId, set: marks });

    if (monthDue) {
      await this.send(userId, month, text.lifeMonthTitle(month), `summary?month=${month}`, true);
    }
    if (yearDue) {
      await this.send(userId, year, text.lifeYearTitle(year), `summary?year=${year}`, false);
    }
  }

  private async send(
    userId: string,
    period: string,
    title: string,
    page: string,
    withNotes: boolean,
  ): Promise<void> {
    const text = coreMessages((await this.usersService.findById(userId))?.locale);
    const story = await this.stories.write(userId, period).catch(() => null);
    const notes = withNotes ? await this.life.monthNotes(userId, period) : [];
    if (!story && !notes.length && !(await this.hasNumbers(userId, period))) {
      return;
    }
    const body = [story?.text, ...notes].filter(Boolean).join('\n\n').slice(0, TELEGRAM_LIMIT);
    await this.notifications.send(userId, {
      title,
      body: `${body ? `${body}\n\n` : ''}${text.lifeMonthLink} ${this.publicUrl}/life/${page}`,
      source: 'life',
    });
  }

  /** Whether the modules have anything for the period (an empty month gets no message). */
  private async hasNumbers(userId: string, period: string): Promise<boolean> {
    return (await this.life.period(userId, periodRange(period))).length > 0;
  }
}
