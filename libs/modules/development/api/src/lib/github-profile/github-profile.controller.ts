import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, ServerActions, ZodValidationPipe } from '@pd/api-core';
import { GithubContributionDay, GithubProfile, githubYearSchema } from '@pd/contracts';
import { GITHUB_PROFILE_ACTIONS } from './github-profile.server-actions';
import { GithubProfileService } from './github-profile.service';

/** Statistics of the GitHub account the token belongs to. */
@Controller('development/github')
export class GithubProfileController {
  constructor(
    private readonly actions: ServerActions,
    private readonly profiles: GithubProfileService,
  ) {}

  /** `null` until the first sync. */
  @Get('profile')
  profile(@CurrentUser() user: AuthUser): Promise<GithubProfile | null> {
    return this.profiles.profile(user.id);
  }

  /** The contribution calendar of a year. */
  @Get('contributions')
  contributions(
    @CurrentUser() user: AuthUser,
    @Query('year', new ZodValidationPipe(githubYearSchema)) year: number,
  ): Promise<GithubContributionDay[]> {
    return this.profiles.contributions(user.id, `${year}-01-01`, `${year}-12-31`);
  }

  /** Refresh now without waiting for the hourly sync. */
  @Post('profile/sync')
  @HttpCode(204)
  async sync(@CurrentUser() user: AuthUser): Promise<void> {
    await this.actions.run(user.id, GITHUB_PROFILE_ACTIONS.sync);
  }
}
