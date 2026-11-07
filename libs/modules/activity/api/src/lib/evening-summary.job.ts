import {Inject, Injectable, Logger, OnModuleInit} from '@nestjs/common';
import {
  DB,
  Database,
  ForecastsService,
  NotificationsService,
  ProjectOverviewService,
  SchedulerService,
  UsersService,
} from '@pd/api-core';
import {zonedDateTime} from '@pd/contracts';
import {eq} from 'drizzle-orm';
import {activityMessages} from './activity.messages';
import {
  activityDevices,
  activityLimits,
  activitySettings,
} from './activity.schema';
import {ActivityService} from './activity.service';
import {
  DaySummary,
  isSummaryDue,
  summaryOf,
  TomorrowForecast,
} from './evening-summary';
import {IndicesService} from './indices/indices.service';
import {WellbeingService} from './wellbeing.service';

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
    private readonly dayIndices: IndicesService,
    private readonly overviews: ProjectOverviewService,
    private readonly forecasts: ForecastsService,
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
      .selectDistinct({userId: activityDevices.userId})
      .from(activityDevices);
    for (const {userId} of owners) {
      await this.sendIfDue(userId).catch(error =>
        this.logger.error(`Evening summary failed for ${userId}: ${error}`),
      );
    }
  }

  private async sendIfDue(userId: string): Promise<void> {
    const [settings] = await this.db
      .select({
        time: activitySettings.summaryTime,
        sentOn: activitySettings.summarySentOn,
      })
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
      .values({userId, summarySentOn: now.date})
      .onConflictDoUpdate({
        target: activitySettings.userId,
        set: {summarySentOn: now.date},
      });

    const day = {from: now.date, to: now.date};
    const stats = await this.activity.stats(userId, day);
    const focus = await this.wellbeing.focusStats(userId, day);
    const reached = await this.db
      .select()
      .from(activityLimits)
      .where(eq(activityLimits.userId, userId));
    const text = activityMessages((await this.users.findById(userId))?.locale);
    const indices = await this.todayIndices(userId, now.date);
    // The sections the user hid stay quiet here too, and the technical (extra) numbers are not
    // worth an evening line.
    const hidden = this.users.hiddenSections(await this.users.findById(userId));
    const unusual = await this.overviews
      .unusual(userId, hidden)
      .then(
        found =>
          found.days[0]?.numbers.filter(number => !number.extra).length ?? null,
      )
      .catch(error => {
        this.logger.warn(`Unusual numbers not known for ${userId}: ${error}`);
        return null;
      });
    const tomorrow = await this.tomorrow(userId);
    const summary = summaryOf(
      stats,
      {completed: focus.completed, seconds: focus.focusSeconds},
      reached
        .filter(limit => limit.notifiedOn === now.date)
        .map(limit => ({
          label: text.limitLabel(limit.kind, limit.app),
          minutes: limit.minutes,
        })),
      indices,
      unusual,
      tomorrow,
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

  /**
   * Tomorrow's trusted forecasts of the default targets, made and kept now if the hourly job has
   * not yet. A failure leaves them out, as with the indices.
   */
  private async tomorrow(userId: string): Promise<TomorrowForecast | null> {
    try {
      const found = await this.forecasts.tomorrow(userId);
      const of = (key: string) =>
        found.find(one => one.key === key)?.value ?? undefined;
      const known = {
        bedtime: of('links.bedtime'),
        deepWork: of('activity.index.deepWork'),
        tasks: of('tasks.done'),
        mood: of('diary.mood'),
      };
      return Object.fromEntries(
        Object.entries(known).filter(([, value]) => value !== undefined),
      ) as TomorrowForecast;
    } catch (error) {
      this.logger.warn(
        `Tomorrow's forecasts not known for ${userId}: ${error}`,
      );
      return null;
    }
  }

  /**
   * Today's deep work and draining time, counted afresh (the hourly job may be up to an hour
   * behind). A failure leaves them out: the day's summary goes without them, never not at all.
   */
  private async todayIndices(
    userId: string,
    today: string,
  ): Promise<DaySummary['indices']> {
    try {
      await this.dayIndices.countDays(
        userId,
        await this.activity.timeZone(userId),
        [today],
      );
      const kept = await this.dayIndices.read(userId, {from: today, to: today});
      const todayOf = (key: string) => kept.get(key)?.[0]?.value ?? null;
      return {deepWork: todayOf('deepWork'), draining: todayOf('draining')};
    } catch (error) {
      this.logger.warn(
        `Today's indices were not counted for ${userId}: ${error}`,
      );
      return {deepWork: null, draining: null};
    }
  }
}
