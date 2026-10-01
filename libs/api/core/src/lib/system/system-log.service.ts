import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SystemLogEntry } from '@pd/contracts';
import { and, desc, eq, gt, lt } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { coreMessages } from '../i18n/core.messages';
import { NotificationsService } from '../notifications/notifications.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { UsersService } from '../users/users.service';
import { NotifyThrottle } from './notify-throttle';
import { LoggedProblem, SystemLogger } from './system-logger';
import { systemLog } from './system.schema';

const DAY_MS = 24 * 60 * 60 * 1000;
/** The same problem within this time is one entry with a counter. */
const SAME_ENTRY_MS = DAY_MS;
const KEEP_DAYS = 14;
const SHOWN_ENTRIES = 200;
const MAX_MESSAGE = 1000;
const MAX_DETAILS = 8000;
/** Their own failures are not told through them: a broken Telegram cannot report itself. */
const NOT_NOTIFIED = new Set(['NotificationsService', 'TelegramChannel', 'TelegramBotService']);

/**
 * The system log: every error and warning the server writes is saved here (see SystemLogger),
 * and an error is also sent to the owner — the first user — through notifications, throttled.
 * Read in Settings → System.
 */
@Injectable()
export class SystemLogService implements OnModuleInit, OnModuleDestroy {
  private readonly throttle = new NotifyThrottle();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    SystemLogger.setSink((problem) => {
      // Fire and forget: logging must not wait for the database, nor fail because of it.
      void this.record(problem).catch((error) =>
        console.error('[system log] an entry was not saved:', error),
      );
    });
    this.scheduler.register({
      name: 'system.log-cleanup',
      cron: '15 4 * * *',
      handler: () => this.purge(),
    });
  }

  onModuleDestroy(): void {
    SystemLogger.setSink(null);
  }

  /** Newest first. */
  async list(): Promise<SystemLogEntry[]> {
    const rows = await this.db
      .select()
      .from(systemLog)
      .orderBy(desc(systemLog.lastAt))
      .limit(SHOWN_ENTRIES);
    return rows.map((row) => ({
      id: String(row.id),
      level: row.level,
      source: row.source,
      message: row.message,
      details: row.details,
      count: row.count,
      firstAt: row.firstAt.toISOString(),
      lastAt: row.lastAt.toISOString(),
    }));
  }

  async clear(): Promise<void> {
    await this.db.delete(systemLog);
  }

  private async record(problem: LoggedProblem): Promise<void> {
    const message = problem.message.slice(0, MAX_MESSAGE);
    const now = new Date();
    const [repeated] = await this.db
      .select({ id: systemLog.id, count: systemLog.count })
      .from(systemLog)
      .where(
        and(
          eq(systemLog.level, problem.level),
          eq(systemLog.source, problem.source),
          eq(systemLog.message, message),
          gt(systemLog.lastAt, new Date(now.getTime() - SAME_ENTRY_MS)),
        ),
      )
      .orderBy(desc(systemLog.lastAt))
      .limit(1);
    if (repeated) {
      await this.db
        .update(systemLog)
        .set({ count: repeated.count + 1, lastAt: now })
        .where(eq(systemLog.id, repeated.id));
    } else {
      await this.db.insert(systemLog).values({
        level: problem.level,
        source: problem.source,
        message,
        details: problem.details?.slice(0, MAX_DETAILS) ?? null,
      });
    }
    if (problem.level === 'error') {
      await this.tellOwner(problem.source, message);
    }
  }

  /** Warnings stay in the log; an error is worth a message — unless it was told recently. */
  private async tellOwner(source: string, message: string): Promise<void> {
    if (NOT_NOTIFIED.has(source) || !this.throttle.allow(`${source}: ${message}`)) {
      return;
    }
    const owner = await this.users.owner();
    if (!owner) {
      return;
    }
    const text = coreMessages(owner.locale);
    await this.notifications.send(owner.id, {
      title: text.systemErrorTitle,
      body: `${source}: ${message}\n\n${text.systemErrorSeeSettings}`,
      source: 'core',
    });
  }

  private async purge(): Promise<void> {
    await this.db
      .delete(systemLog)
      .where(lt(systemLog.lastAt, new Date(Date.now() - KEEP_DAYS * DAY_MS)));
  }
}
