import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AppConfig,
  DB,
  Database,
  NotificationsService,
  SchedulerService,
  UsersService,
} from '@pd/api-core';
import {
  addDays,
  daysBetween,
  LocalDate,
  parseLocalDate,
  QUESTIONNAIRES,
  toLocalDate,
  zonedDateTime,
} from '@pd/contracts';
import { and, desc, eq, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { psychologyMessages } from './psychology.messages';
import { psychologyAssessments, psychologySettings } from './psychology.schema';

/** How the questionnaires are known, in every language. */
const TEST_NAMES: Record<string, string> = { who5: 'WHO-5', gad7: 'GAD-7', phq9: 'PHQ-9' };

/** A reminder missed by a restart is still sent within this many minutes. */
const CATCH_UP_MINUTES = 30;

/**
 * A questionnaire on a schedule: WHO-5 (or another) every 7, 14 or 30 days, a message in
 * Telegram at the chosen time with the link to take it. Not when it was taken within the period
 * anyway; once a period at most.
 */
@Injectable()
export class PsychologyReminders implements OnModuleInit {
  private readonly logger = new Logger(PsychologyReminders.name);
  private readonly publicUrl: string;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) config: AppConfig,
    private readonly scheduler: SchedulerService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
  ) {
    this.publicUrl = config.get('PUBLIC_URL', { infer: true }).replace(/\/+$/, '');
  }

  onModuleInit(): void {
    this.scheduler.register({
      name: 'psychology.questionnaire-reminders',
      cron: '* * * * *',
      quiet: true,
      handler: () => this.remindDue(),
    });
  }

  async remindDue(now: Date = new Date()): Promise<void> {
    const due = await this.db
      .select()
      .from(psychologySettings)
      .where(isNotNull(psychologySettings.reminderTest));
    for (const settings of due) {
      try {
        await this.remindOne(settings, now);
      } catch (error) {
        this.logger.warn(`A questionnaire reminder was not sent: ${error}`);
      }
    }
  }

  private async remindOne(
    settings: typeof psychologySettings.$inferSelect,
    now: Date,
  ): Promise<void> {
    const user = await this.users.findById(settings.userId);
    const test = QUESTIONNAIRES.find((item) => item.id === settings.reminderTest);
    if (!user || !test) {
      return;
    }
    const every = settings.reminderEveryDays ?? 30;
    const { date, time } = zonedDateTime(now, this.users.timeZoneOf(user));
    if (!isDue(settings.reminderAt ?? '20:00', time)) {
      return;
    }
    const [last] = await this.db
      .select({ takenOn: psychologyAssessments.takenOn })
      .from(psychologyAssessments)
      .where(
        and(eq(psychologyAssessments.userId, user.id), eq(psychologyAssessments.test, test.id)),
      )
      .orderBy(desc(psychologyAssessments.takenOn))
      .limit(1);
    const since = last ? daysBetween(parseLocalDate(last.takenOn), parseLocalDate(date)) : null;
    if (since !== null && since < every) {
      return;
    }
    // Claimed by this run: one reminder a period, whatever restarts or instances.
    const notBefore = shift(date, -every + 1);
    const [claimed] = await this.db
      .update(psychologySettings)
      .set({ remindedOn: date })
      .where(
        and(
          eq(psychologySettings.userId, user.id),
          or(isNull(psychologySettings.remindedOn), lt(psychologySettings.remindedOn, notBefore)),
        ),
      )
      .returning({ userId: psychologySettings.userId });
    if (!claimed) {
      return;
    }
    const text = psychologyMessages(user.locale);
    await this.notifications.send(user.id, {
      title: text.reminderTitle(TEST_NAMES[test.id]),
      body: text.reminderBody(since, `${this.publicUrl}/psychology/checkups`),
      source: 'psychology',
    });
  }
}

function isDue(at: string, now: string): boolean {
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const late = minutes(now) - minutes(at);
  return late >= 0 && late < CATCH_UP_MINUTES;
}

function shift(date: LocalDate, days: number): LocalDate {
  return toLocalDate(addDays(parseLocalDate(date), days));
}
