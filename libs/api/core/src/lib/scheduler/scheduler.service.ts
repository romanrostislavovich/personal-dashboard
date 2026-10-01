import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss } from 'pg-boss';
import { AppConfig } from '../config/env';
import { JobRunsService } from '../system/job-runs.service';

export interface ScheduledJob {
  /** Unique name prefixed with the module id: `birthdays.daily-reminders`. */
  name: string;
  /** Cron expression, for example `0 9 * * *` — every day at 09:00 (in APP_TIMEZONE). */
  cron: string;
  handler: () => Promise<void>;
  /** A job that runs every minute: its runs are not written to the log one by one. */
  quiet?: boolean;
}

/**
 * Background job scheduler on top of pg-boss (the queue lives in the same PostgreSQL,
 * no separate Redis needed). Modules register jobs in `onModuleInit`:
 *
 * ```ts
 * this.scheduler.register({ name: 'birthdays.daily-reminders', cron: '0 9 * * *', handler: () => this.remind() });
 * ```
 *
 * If the server was off when a job was due, it runs once after startup. Every run is recorded
 * (JobRunsService), and a failed one is reported: Settings → System shows both.
 *
 * A sync client (SYNC_MODE=client) runs no jobs: the server does, and its results arrive
 * with the sync — otherwise payments would be charged and reminders sent twice.
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly jobs: ScheduledJob[] = [];
  private readonly boss: PgBoss;

  constructor(
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly runs: JobRunsService,
  ) {
    this.boss = new PgBoss(config.get('DATABASE_URL', { infer: true }));
    this.boss.on('error', (error) => this.logger.error(error));
  }

  register(job: ScheduledJob): void {
    this.jobs.push(job);
  }

  /** Run a job outside its schedule (handy for debugging). */
  async runNow(name: string): Promise<void> {
    await this.boss.send(name, {});
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.boss.start();
    if (this.config.get('SYNC_MODE', { infer: true }) === 'client') {
      this.logger.log('Sync client: background jobs run on the server');
      return;
    }
    const tz = this.config.get('APP_TIMEZONE', { infer: true });

    for (const job of this.jobs) {
      await this.boss.createQueue(job.name);
      await this.boss.schedule(job.name, job.cron, null, { tz, missed: 'once' });
      await this.boss.work(job.name, async () => {
        if (!job.quiet) {
          this.logger.log(`Running job ${job.name}`);
        }
        await this.runs.track(job, job.handler).catch((error) => {
          // An error-level entry: it lands in the system log and is told to the owner.
          this.logger.error(
            `Job ${job.name} failed: ${error}`,
            error instanceof Error ? error.stack : '',
          );
          throw error;
        });
      });
    }
    await this.runs.forget(this.jobs.map((job) => job.name));
    this.logger.log(`Scheduled ${this.jobs.length} job(s) in ${tz}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.boss.stop();
  }
}
