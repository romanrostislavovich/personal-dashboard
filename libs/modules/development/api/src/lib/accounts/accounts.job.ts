import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerService, UsersService } from '@pd/api-core';
import { TOKEN_PROVIDERS } from '@pd/contracts';
import { AccountTokensService } from './account-tokens.service';
import { CodeAccountsService } from './code-accounts.service';

/**
 * Refreshes the GitLab and Bitbucket accounts of every user who connected them, once an hour:
 * the streak on the home page and in the digest should not lag behind the commits of the day.
 */
@Injectable()
export class AccountsJob implements OnModuleInit {
  private readonly logger = new Logger(AccountsJob.name);

  constructor(
    private readonly scheduler: SchedulerService,
    private readonly users: UsersService,
    private readonly tokens: AccountTokensService,
    private readonly accounts: CodeAccountsService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'development.accounts-sync',
      // Not on the hour: the repository sync runs then and shares the tokens' rate limits.
      cron: '40 * * * *',
      handler: () => this.run(),
    });
  }

  private async run(): Promise<void> {
    for (const user of await this.users.findAll()) {
      for (const provider of TOKEN_PROVIDERS) {
        if (!(await this.tokens.has(user.id, provider))) {
          continue;
        }
        // One bad token must not stop the rest; the error is saved for the page.
        await this.accounts
          .sync(user.id, provider)
          .catch((error) =>
            this.logger.warn(`${provider} account sync for ${user.id} failed: ${error}`),
          );
      }
    }
  }
}
