import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {DB, Database, SchedulerService} from '@pd/api-core';
import {users} from '@pd/api-core/schema';
import {asc, gt} from 'drizzle-orm';
import {TelemetryService} from './telemetry.service';
import {WorkstateService} from './workstate.service';

@Injectable()
export class ActivityContextJobs implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly scheduler: SchedulerService,
    private readonly telemetry: TelemetryService,
    private readonly workstates: WorkstateService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'activity.context-cleanup',
      cron: '45 4 * * *',
      handler: () => this.cleanup(),
    });
  }

  async cleanup(): Promise<void> {
    let after: string | undefined;
    for (;;) {
      const batch = await this.db
        .select({id: users.id})
        .from(users)
        .where(after ? gt(users.id, after) : undefined)
        .orderBy(asc(users.id))
        .limit(100);
      for (const user of batch) {
        await this.telemetry.deleteOld(user.id);
        await this.workstates.deleteOld(user.id);
      }
      if (batch.length < 100) return;
      after = batch[batch.length - 1].id;
    }
  }
}
