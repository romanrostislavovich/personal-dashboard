import {Inject, Injectable, Logger, OnModuleInit} from '@nestjs/common';
import {
  addDays,
  parseLocalDate,
  toLocalDate,
  zonedDateTime,
} from '@pd/contracts';
import {and, eq, isNull, ne, or} from 'drizzle-orm';
import {DB, Database} from '../database/database.module';
import {SchedulerService} from '../scheduler/scheduler.service';
import {UsersService} from '../users/users.service';
import {lifelogSettings} from './life.schema';
import {LifelogGenerator} from './lifelog-generator.service';

export function lifelogDueDay(now: Date, timeZone: string): string | null {
  const local = zonedDateTime(now, timeZone);
  return local.time < '03:00'
    ? null
    : toLocalDate(addDays(parseLocalDate(local.date), -1));
}

@Injectable()
export class LifelogJob implements OnModuleInit {
  private readonly logger = new Logger(LifelogJob.name);
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly scheduler: SchedulerService,
    private readonly users: UsersService,
    private readonly generator: LifelogGenerator,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'life.daily-chronicle',
      cron: '25 * * * *',
      handler: () => this.run(),
    });
  }

  async run(now = new Date()): Promise<void> {
    const settings = await this.db
      .select()
      .from(lifelogSettings)
      .where(eq(lifelogSettings.enabled, true));
    for (const setting of settings) {
      try {
        const user = await this.users.findById(setting.userId);
        if (!user) continue;
        const day = lifelogDueDay(now, this.users.timeZoneOf(user));
        if (!day || setting.lastAttemptDay === day) continue;
        // Atomic claim: one paid attempt per local day across instances, including failures.
        const claimed = await this.db
          .update(lifelogSettings)
          .set({lastAttemptDay: day})
          .where(
            and(
              eq(lifelogSettings.userId, setting.userId),
              eq(lifelogSettings.enabled, true),
              or(
                isNull(lifelogSettings.lastAttemptDay),
                ne(lifelogSettings.lastAttemptDay, day),
              ),
            ),
          )
          .returning({userId: lifelogSettings.userId});
        if (claimed.length) await this.generator.generate(setting.userId, day);
      } catch {
        this.logger.warn(
          `Daily chronicle failed for ${setting.userId}; manual retry is available`,
        );
      }
    }
  }
}
