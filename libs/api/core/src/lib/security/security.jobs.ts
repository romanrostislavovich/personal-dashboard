import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerService } from '../scheduler/scheduler.service';
import { ServerActions } from '../sync/server-actions';
import { UsersService } from '../users/users.service';
import { SecurityAgent } from './security-agent.service';
import { SecurityService } from './security.service';
import { SignInLog } from './sign-in-log.service';

/** What reaches outside (the site, GitHub) or reads the server's files runs on the server. */
export const SECURITY_ACTIONS = {
  scan: 'security.scan',
  investigate: 'security.investigate',
  guide: 'security.guide',
} as const;

/**
 * The agent's schedule: the rules check every hour (right after the scan of the server, which
 * runs at minute 17), the AI investigates once a day. Both also run on request from the page.
 */
@Injectable()
export class SecurityJobs implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly actions: ServerActions,
    private readonly users: UsersService,
    private readonly security: SecurityService,
    private readonly agent: SecurityAgent,
    private readonly signIns: SignInLog,
  ) {}

  onModuleInit(): void {
    this.actions.register(SECURITY_ACTIONS.scan, (userId) => this.security.scan(userId));
    this.actions.register(SECURITY_ACTIONS.investigate, (userId) => this.agent.investigate(userId));
    this.actions.register(SECURITY_ACTIONS.guide, (userId, args) =>
      this.agent.explain(userId, String(args['id'])),
    );
    this.scheduler.register({
      name: 'security.scan',
      cron: '20 * * * *',
      handler: async () => {
        await this.signIns.prune();
        const owner = await this.users.owner();
        if (owner) {
          await this.security.scan(owner.id);
        }
      },
    });
    this.scheduler.register({
      name: 'security.investigate',
      cron: '40 6 * * *',
      handler: async () => {
        const owner = await this.users.owner();
        if (owner) {
          await this.agent.runDaily(owner.id);
        }
      },
    });
  }
}
