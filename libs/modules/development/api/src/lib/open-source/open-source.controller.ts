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
import { trackedRepoInputSchema } from '@pd/contracts';
import { z } from 'zod';
import { ReposService } from './repos.service';
import { OPEN_SOURCE_ACTIONS } from './open-source.server-actions';

/** Tracked open source repositories. */
@Controller('development/repos')
export class OpenSourceController {
  constructor(
    private readonly actions: ServerActions,
    private readonly repos: ReposService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.repos.list(user.id);
  }

  @Post()
  @HttpCode(204)
  add(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(trackedRepoInputSchema))
    input: z.output<typeof trackedRepoInputSchema>,
  ) {
    return this.actions.run(user.id, OPEN_SOURCE_ACTIONS.addRepo, input);
  }

  /** Changes the repository (owner/name) or its npm package. */
  @Put(':id')
  @HttpCode(204)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(trackedRepoInputSchema))
    input: z.output<typeof trackedRepoInputSchema>,
  ) {
    return this.actions.run(user.id, OPEN_SOURCE_ACTIONS.updateRepo, { id, input });
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.repos.remove(user.id, id);
  }

  /** Refresh the data now without waiting for the hourly sync. */
  @Post('sync-all')
  @HttpCode(204)
  async syncAll(@CurrentUser() user: AuthUser) {
    await this.actions.run(user.id, OPEN_SOURCE_ACTIONS.syncAll);
  }

  @Post(':id/sync')
  @HttpCode(204)
  syncOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.actions.run(user.id, OPEN_SOURCE_ACTIONS.syncRepo, { id });
  }
}
