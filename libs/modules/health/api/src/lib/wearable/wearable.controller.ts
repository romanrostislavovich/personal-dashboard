import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Put,
  Query,
  Redirect,
} from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
  Public,
  RateLimit,
  ServerKeysService,
  ZodValidationPipe,
} from '@pd/api-core';
import {
  GoogleHealthAppInput,
  googleHealthAppInputSchema,
  WearableDay,
  WearableDaysQuery,
  wearableDaysQuerySchema,
  WearableStatus,
} from '@pd/contracts';
import {WearableService} from './wearable.service';

/** The band through the Google Health API: `/api/medical/wearable`. */
@Controller('medical/wearable')
export class WearableController {
  constructor(
    private readonly wearable: WearableService,
    private readonly keys: ServerKeysService,
  ) {}

  @Get()
  status(@CurrentUser() user: AuthUser): Promise<WearableStatus> {
    return this.wearable.status(user.id);
  }

  @Get('days')
  days(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(wearableDaysQuerySchema))
    query: WearableDaysQuery,
  ): Promise<WearableDay[]> {
    return this.wearable.days(user.id, query);
  }

  /** The owner sets the keys of the server's Google Cloud app (once for every user). */
  @Put('app')
  @HttpCode(204)
  async setApp(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(googleHealthAppInputSchema))
    input: GoogleHealthAppInput,
  ): Promise<void> {
    await this.keys.assertOwner(user.id);
    await this.wearable.setApp(input.clientId, input.clientSecret);
  }

  @Delete('app')
  @HttpCode(204)
  async removeApp(@CurrentUser() user: AuthUser): Promise<void> {
    await this.keys.assertOwner(user.id);
    await this.wearable.removeApp();
  }

  @Post('connect')
  async connect(@CurrentUser() user: AuthUser): Promise<{url: string}> {
    return {url: await this.wearable.connectUrl(user.id)};
  }

  /** Google returns the browser here after sign-in; the user is identified by `state`. */
  @Public()
  @Get('callback')
  @Redirect()
  async callback(@Query('code') code?: string, @Query('state') state?: string) {
    return {url: await this.wearable.handleCallback(code, state)};
  }

  /** Read the new days now, not with the next hour's run. */
  @Post('sync')
  @HttpCode(204)
  @RateLimit(6, 60)
  sync(@CurrentUser() user: AuthUser): Promise<void> {
    return this.wearable.sync(user.id);
  }

  @Delete()
  @HttpCode(204)
  disconnect(@CurrentUser() user: AuthUser): Promise<void> {
    return this.wearable.disconnect(user.id);
  }
}
