import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthUser, CurrentUser, ServerActions, ZodValidationPipe } from '@pd/api-core';
import { trackedRepoInputSchema, trackedRepoUpdateSchema } from '@pd/contracts';
import { z } from 'zod';
import { ReposService } from './repos.service';
import { OPEN_SOURCE_ACTIONS } from './open-source.server-actions';

/** Repositories of the Open Source section. */
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

  /** Hides or shows a repository, switches its notifications, sets its npm package. */
  @Patch(':id')
  @HttpCode(204)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(trackedRepoUpdateSchema))
    update: z.output<typeof trackedRepoUpdateSchema>,
  ) {
    return this.repos.update(user.id, id, update);
  }

  /** Only a repository added by hand; one of the account is hidden instead. */
  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.repos.remove(user.id, id);
  }

  /** Re-read the account's repositories and refresh all of them now, not on the hour. */
  @Post('sync-all')
  @HttpCode(204)
  async syncAll(@CurrentUser() user: AuthUser) {
    await this.actions.run(user.id, OPEN_SOURCE_ACTIONS.syncAll);
  }
}
