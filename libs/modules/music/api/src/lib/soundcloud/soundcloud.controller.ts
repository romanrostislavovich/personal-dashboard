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
  Put,
} from '@nestjs/common';
import { AuthUser, CurrentUser, ServerActions, ZodValidationPipe } from '@pd/api-core';
import {
  SoundcloudConnectInput,
  soundcloudConnectSchema,
  SoundcloudStats,
  SoundcloudTrackUpdate,
  soundcloudTrackUpdateSchema,
} from '@pd/contracts';
import { SOUNDCLOUD_ACTIONS } from './soundcloud.server-actions';
import { SoundcloudService } from './soundcloud.service';

/** The user's own tracks on SoundCloud. Whether it is connected comes with `/api/music/settings`. */
@Controller('music/soundcloud')
export class SoundcloudController {
  constructor(
    private readonly actions: ServerActions,
    private readonly soundcloud: SoundcloudService,
  ) {}

  /** `null` — not connected. */
  @Get()
  stats(@CurrentUser() user: AuthUser): Promise<SoundcloudStats | null> {
    return this.soundcloud.stats(user.id);
  }

  /** Finds the profile and loads its tracks right away. */
  @Put()
  @HttpCode(204)
  async connect(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(soundcloudConnectSchema)) input: SoundcloudConnectInput,
  ): Promise<void> {
    await this.actions.run(user.id, SOUNDCLOUD_ACTIONS.connect, input);
  }

  /** Forgets the profile, its tracks and their history. */
  @Delete()
  @HttpCode(204)
  disconnect(@CurrentUser() user: AuthUser): Promise<void> {
    return this.soundcloud.disconnect(user.id);
  }

  /** Refresh now without waiting for the hourly sync. */
  @Post('sync')
  @HttpCode(204)
  async sync(@CurrentUser() user: AuthUser): Promise<void> {
    await this.actions.run(user.id, SOUNDCLOUD_ACTIONS.sync);
  }

  /** Switches the notifications of one track. */
  @Patch('tracks/:id')
  @HttpCode(204)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(soundcloudTrackUpdateSchema)) update: SoundcloudTrackUpdate,
  ): Promise<void> {
    return this.soundcloud.setNotify(user.id, id, update.notify);
  }
}
