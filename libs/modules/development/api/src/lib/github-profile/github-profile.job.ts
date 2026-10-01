import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AchievementsService, SchedulerService, UsersService } from '@pd/api-core';
import { GithubTokenService } from '../github/github-token.service';
import { GithubProfileService } from './github-profile.service';

/**
 * Refreshes the GitHub account of every user with a token once an hour: the streak on the home
 * page and in the digest should not lag behind the commits of the day.
 */
@Injectable()
export class GithubProfileJob implements OnModuleInit {
  private readonly logger = new Logger(GithubProfileJob.name);

  constructor(
    private readonly scheduler: SchedulerService,
    private readonly users: UsersService,
    private readonly tokens: GithubTokenService,
    private readonly profiles: GithubProfileService,
    private readonly achievements: AchievementsService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'development.github-profile-sync',
      // Not on the hour: the repository sync runs then and shares the token's rate limit.
      cron: '20 * * * *',
      handler: () => this.run(),
    });
  }

  private async run(): Promise<void> {
    for (const user of await this.users.findAll()) {
      if (!(await this.tokens.hasToken(user.id))) {
        continue;
      }
      // One user's bad token must not stop the others; the error is saved for the page.
      await this.profiles
        .sync(user.id)
        .then(() => this.achievements.evaluate(user.id))
        .catch((error) => this.logger.warn(`GitHub profile sync for ${user.id} failed: ${error}`));
    }
  }
}
