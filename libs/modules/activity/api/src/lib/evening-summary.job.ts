import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DB, Database, NotificationsService, SchedulerService, UsersService } from '@pd/api-core';
import { zonedDateTime } from '@pd/contracts';
import { eq } from 'drizzle-orm';
import { activityMessages } from './activity.messages';
import { activityDevices, activityLimits, activitySettings } from './activity.schema';
import { ActivityService } from './activity.service';
import { isSummaryDue, summaryOf } from './evening-summary';
import { WellbeingService } from './wellbeing.service';

const DEFAULT_TIME = '21:00';

/**
 * The summary of the day at the user's evening hour (21:00 unless they chose otherwise): time
 * at the computer, the top categories, focus, the limits reached. Every channel gets it, like
 * the morning digest; a day with next to nothing recorded gets none.
 */
@Injectable()
export class EveningSummaryJob implements OnModuleInit {
  private readonly logger = new Logger(EveningSummaryJob.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly scheduler: SchedulerService,
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
    private readonly activity: ActivityService,
    private readonly wellbeing: WellbeingService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'activity.evening-summary',
      cron: '*/5 * * * *',
      handler: () => this.sendAll(),
    });
  }

  private async sendAll(): Promise<void> {
    // Only users with a tracker have anything to sum up.
    const owners = await this.db
      .selectDistinct({ userId: activityDevices.userId })
      .from(activityDevices);
    for (const { userId } of owners) {
      await this.sendIfDue(userId).catch((error) =>
        this.logger.error(`Evening summary failed for ${userId}: ${error}`),
      );
    }
  }

  private async sendIfDue(userId: string): Promise<void> {
    const [settings] = await this.db
      .select({ time: activitySettings.summaryTime, sentOn: activitySettings.summarySentOn })
      .from(activitySettings)
      .where(eq(activitySettings.userId, userId));
    const time = settings ? settings.time : DEFAULT_TIME;
    const now = zonedDateTime(new Date(), await this.activity.timeZone(userId));
    if (!isSummaryDue(time, settings?.sentOn ?? null, now)) {
      return;
    }
    // Marked first: whatever happens next, one attempt a day.
    await this.db
      .insert(activitySettings)
      .values({ userId, summarySentOn: now.date })
      .onConflictDoUpdate({ target: activitySettings.userId, set: { summarySentOn: now.date } });

    const day = { from: now.date, to: now.date };
    const stats = await this.activity.stats(userId, day);
    const focus = await this.wellbeing.focusStats(userId, day);
    const reached = await this.db
      .select()
      .from(activityLimits)
      .where(eq(activityLimits.userId, userId));
    const text = activityMessages((await this.users.findById(userId))?.locale);
    const summary = summaryOf(
      stats,
      { completed: focus.completed, seconds: focus.focusSeconds },
      reached
        .filter((limit) => limit.notifiedOn === now.date)
        .map((limit) => ({
          label: text.limitLabel(limit.kind, limit.app),
          minutes: limit.minutes,
        })),
    );
    if (!summary) {
      return;
    }
    await this.notifications.send(userId, {
      title: text.summaryTitle(summary.totalSeconds),
      body: text.summaryBody(summary),
      source: 'activity',
    });
  }
}
