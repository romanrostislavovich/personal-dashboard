import { Body, Controller, Delete, Get, HttpCode, Logger, Put } from '@nestjs/common';
import { AuthUser, CurrentUser, ServerActions, ZodValidationPipe } from '@pd/api-core';
import { GithubTokenInput, githubTokenInputSchema } from '@pd/contracts';
import { GITHUB_PROFILE_ACTIONS } from '../github-profile/github-profile.server-actions';
import { GithubTokenService } from './github-token.service';

/** The GitHub token shared by the open source repositories and the GitHub account. */
@Controller('development/github')
export class GithubController {
  private readonly logger = new Logger(GithubController.name);

  constructor(
    private readonly actions: ServerActions,
    private readonly tokens: GithubTokenService,
  ) {}

  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return this.tokens.settings(user.id);
  }

  /** Saves the token and loads the account it belongs to right away. */
  @Put('token')
  @HttpCode(204)
  async saveToken(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(githubTokenInputSchema)) input: GithubTokenInput,
  ): Promise<void> {
    await this.tokens.save(user.id, input.token);
    // A token that only reads public repositories is still a valid one for Open Source.
    await this.actions
      .run(user.id, GITHUB_PROFILE_ACTIONS.sync)
      .catch((error) => this.logger.warn(`GitHub profile of ${user.id} was not loaded: ${error}`));
  }

  @Delete('token')
  @HttpCode(204)
  removeToken(@CurrentUser() user: AuthUser) {
    return this.tokens.remove(user.id);
  }
}
