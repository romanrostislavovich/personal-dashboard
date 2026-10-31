import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
} from '@nestjs/common';
import {SystemStatus} from '@pd/contracts';
import {AuthUser, CurrentUser} from '../auth/current-user.decorator';
import {SyncService} from '../sync/sync.service';
import {UsersService} from '../users/users.service';
import {JobRunsService} from './job-runs.service';
import {SystemLogService} from './system-log.service';
import {SystemMetricsService} from './system-metrics.service';

/**
 * How this instance is doing: background jobs, the log of errors and the numbers (metrics). Only for the owner (the
 * first user) — the log is about the whole server, not about one account.
 */
@Controller('system')
export class SystemController {
  constructor(
    private readonly users: UsersService,
    private readonly sync: SyncService,
    private readonly jobs: JobRunsService,
    private readonly log: SystemLogService,
    private readonly metrics: SystemMetricsService,
  ) {}

  @Get('status')
  async status(@CurrentUser() user: AuthUser): Promise<SystemStatus> {
    await this.requireOwner(user);
    return {
      // A sync client leaves the jobs to the server (see SchedulerService).
      jobsRunHere: this.sync.mode !== 'client',
      jobs: await this.jobs.list(),
      log: await this.log.list(),
      metrics: await this.metrics.snapshot(),
    };
  }

  @Delete('log')
  @HttpCode(204)
  async clearLog(@CurrentUser() user: AuthUser): Promise<void> {
    await this.requireOwner(user);
    await this.log.clear();
  }

  private async requireOwner(user: AuthUser): Promise<void> {
    if ((await this.users.owner())?.id !== user.id) {
      throw new ForbiddenException(
        'Only the owner of the dashboard sees the system status',
      );
    }
  }
}
