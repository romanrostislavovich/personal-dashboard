import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { AuthUser, CurrentUser, ServerActions, ZodValidationPipe } from '@pd/api-core';
import { GithubTokenInput, githubTokenInputSchema, trackedRepoInputSchema } from '@pd/contracts';
import { z } from 'zod';
import { GithubTokenService } from './github-token.service';
import { ReposService } from './repos.service';
import { GITHUB_OSS_ACTIONS } from './github-oss.server-actions';

@Controller('github-oss')
export class GithubOssController {
  constructor(
    private readonly actions: ServerActions,
    private readonly repos: ReposService,
    private readonly tokens: GithubTokenService,
  ) {}

  // --- Repositories ---

  @Get('repos')
  list(@CurrentUser() user: AuthUser) {
    return this.repos.list(user.id);
  }

  @Post('repos')
  @HttpCode(204)
  add(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(trackedRepoInputSchema))
    input: z.output<typeof trackedRepoInputSchema>,
  ) {
    return this.actions.run(user.id, GITHUB_OSS_ACTIONS.addRepo, input);
  }

  /** Changes the repository (owner/name) or its npm package. */
  @Put('repos/:id')
  @HttpCode(204)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(trackedRepoInputSchema))
    input: z.output<typeof trackedRepoInputSchema>,
  ) {
    return this.actions.run(user.id, GITHUB_OSS_ACTIONS.updateRepo, { id, input });
  }

  @Delete('repos/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.repos.remove(user.id, id);
  }

  /** Refresh the data now without waiting for the hourly sync. */
  @Post('sync')
  @HttpCode(204)
  async syncAll(@CurrentUser() user: AuthUser) {
    await this.actions.run(user.id, GITHUB_OSS_ACTIONS.syncAll);
  }

  @Post('repos/:id/sync')
  @HttpCode(204)
  syncOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.actions.run(user.id, GITHUB_OSS_ACTIONS.syncRepo, { id });
  }

  // --- Token ---

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
