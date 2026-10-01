import { Body, Controller, Delete, Get, HttpCode, Put } from '@nestjs/common';
import { AuthUser, CurrentUser, ZodValidationPipe } from '@pd/api-core';
import { GithubTokenInput, githubTokenInputSchema } from '@pd/contracts';
import { GithubTokenService } from './github-token.service';

/** The GitHub token shared by the open source repositories and the GitHub account. */
@Controller('development/github')
export class GithubController {
  constructor(private readonly tokens: GithubTokenService) {}

  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return this.tokens.settings(user.id);
  }

  @Put('token')
  @HttpCode(204)
  saveToken(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(githubTokenInputSchema)) input: GithubTokenInput,
  ) {
    return this.tokens.save(user.id, input.token);
  }

  @Delete('token')
  @HttpCode(204)
  removeToken(@CurrentUser() user: AuthUser) {
    return this.tokens.remove(user.id);
  }
}
