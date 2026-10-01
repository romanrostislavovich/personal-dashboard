import { Body, Controller, Delete, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, ServerActions, ZodValidationPipe } from '@pd/api-core';
import {
  WAKATIME_PERIODS,
  WakatimeKeyInput,
  wakatimeKeyInputSchema,
  WakatimePeriod,
  WakatimeSettings,
  WakatimeStats,
} from '@pd/contracts';
import { z } from 'zod';
import { WAKATIME_ACTIONS } from './wakatime.server-actions';
import { WakatimeService } from './wakatime.service';

const periodSchema = z.coerce
  .number()
  .refine((days): days is WakatimePeriod => WAKATIME_PERIODS.includes(days as WakatimePeriod))
  .default(7);

/** Coding time from WakaTime. */
@Controller('development/wakatime')
export class WakatimeController {
  constructor(
    private readonly actions: ServerActions,
    private readonly wakatime: WakatimeService,
  ) {}

  @Get('settings')
  settings(@CurrentUser() user: AuthUser): Promise<WakatimeSettings> {
    return this.wakatime.settings(user.id);
  }

  /** Checks the key, saves it and copies the days WakaTime still has. */
  @Put('key')
  @HttpCode(204)
  async connect(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(wakatimeKeyInputSchema)) input: WakatimeKeyInput,
  ): Promise<void> {
    await this.actions.run(user.id, WAKATIME_ACTIONS.connect, input);
  }

  @Delete('key')
  @HttpCode(204)
  disconnect(@CurrentUser() user: AuthUser): Promise<void> {
    return this.wakatime.disconnect(user.id);
  }

  @Get('stats')
  stats(
    @CurrentUser() user: AuthUser,
    @Query('days', new ZodValidationPipe(periodSchema)) period: WakatimePeriod,
  ): Promise<WakatimeStats> {
    return this.wakatime.stats(user.id, period);
  }

  /** Refresh now without waiting for the hourly sync. */
  @Post('sync')
  @HttpCode(204)
  async sync(@CurrentUser() user: AuthUser): Promise<void> {
    await this.actions.run(user.id, WAKATIME_ACTIONS.sync);
  }
}
