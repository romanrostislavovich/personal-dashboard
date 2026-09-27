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
import { AuthUser, CurrentUser, ZodValidationPipe } from '@pd/api-core';
import { GithubTokenInput, githubTokenInputSchema, trackedRepoInputSchema } from '@pd/contracts';
import { z } from 'zod';
import { GithubTokenService } from './github-token.service';
import { ReposService } from './repos.service';

@Controller('github-oss')
export class GithubOssController {
  constructor(
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
    return this.repos.add(user.id, input.repo, input.npmPackage ?? null);
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
    await this.repos.syncAll(user.id);
  }

  @Post('repos/:id/sync')
  @HttpCode(204)
  syncOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.repos.syncOne(user.id, id);
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
