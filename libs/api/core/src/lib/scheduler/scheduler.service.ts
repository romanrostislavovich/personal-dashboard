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

export interface ScheduledJob {
  /** Уникальное имя с префиксом модуля: `birthdays.daily-reminders`. */
  name: string;
  /** Cron-выражение, например `0 9 * * *` — каждый день в 09:00 (по APP_TIMEZONE). */
  cron: string;
  handler: () => Promise<void>;
}

/**
 * Планировщик фоновых задач поверх pg-boss (очередь живёт в той же PostgreSQL,
 * отдельный Redis не нужен). Модули регистрируют задачи в `onModuleInit`:
 *
 * ```ts
 * this.scheduler.register({ name: 'birthdays.daily-reminders', cron: '0 9 * * *', handler: () => this.remind() });
 * ```
 *
 * Если сервер был выключен в момент запуска, задача выполнится один раз после старта.
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly jobs: ScheduledJob[] = [];
  private readonly boss: PgBoss;

  constructor(@Inject(ConfigService) private readonly config: AppConfig) {
    this.boss = new PgBoss(config.get('DATABASE_URL', { infer: true }));
    this.boss.on('error', (error) => this.logger.error(error));
  }

  register(job: ScheduledJob): void {
    this.jobs.push(job);
  }

  /** Запустить задачу вне расписания (удобно для отладки). */
  async runNow(name: string): Promise<void> {
    await this.boss.send(name, {});
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.boss.start();
    const tz = this.config.get('APP_TIMEZONE', { infer: true });

    for (const job of this.jobs) {
      await this.boss.createQueue(job.name);
      await this.boss.schedule(job.name, job.cron, null, { tz, missed: 'once' });
      await this.boss.work(job.name, async () => {
        this.logger.log(`Running job ${job.name}`);
        await job.handler();
      });
    }
    this.logger.log(`Scheduled ${this.jobs.length} job(s) in ${tz}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.boss.stop();
  }
}
