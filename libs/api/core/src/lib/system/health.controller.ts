import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import {sql} from 'drizzle-orm';
import {Public} from '../auth/public.decorator';
import {DB, Database} from '../database/database.module';
import {SchedulerService} from '../scheduler/scheduler.service';

const DATABASE_TIMEOUT_MS = 3_000;

/**
 * The health check of the container (Dockerfile HEALTHCHECK) and of a deploy: "ok" only when
 * the database answers and the background jobs run. The migrations need no check — the app
 * does not take requests before they are applied (DatabaseModule).
 */
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly scheduler: SchedulerService,
  ) {}

  @Public()
  @Get()
  async check() {
    // A database that does not answer at all is as bad as an error: no waiting for the pool.
    const database = await Promise.race([
      this.db.execute(sql`select 1`).then(
        () => true,
        () => false,
      ),
      new Promise<false>(resolve =>
        setTimeout(() => resolve(false), DATABASE_TIMEOUT_MS),
      ),
    ]);
    const jobs = this.scheduler.running;
    if (!database || !jobs) {
      throw new ServiceUnavailableException({status: 'error', database, jobs});
    }
    return {status: 'ok'};
  }
}
