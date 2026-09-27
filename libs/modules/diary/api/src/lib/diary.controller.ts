import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, ZodValidationPipe } from '@pd/api-core';
import {
  DiaryEntryInput,
  diaryEntryInputSchema,
  DiaryQuery,
  diaryQuerySchema,
  DiarySettings,
  DiarySummary,
  DiarySummaryRequest,
  diarySummaryRequestSchema,
  diarySettingsSchema,
} from '@pd/contracts';
import { z } from 'zod';
import { DiarySummaryService } from './diary-summary.service';
import { DiaryService } from './diary.service';

/** `:day` is the entry date `YYYY-MM-DD`. */
const dayPipe = new ZodValidationPipe(z.iso.date());

@Controller('diary')
export class DiaryController {
  constructor(
    private readonly diary: DiaryService,
    private readonly summaries: DiarySummaryService,
  ) {}

  @Get('entries')
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(diaryQuerySchema)) query: DiaryQuery,
  ) {
    return this.diary.list(user.id, query);
  }

  /** The day's entry, or `null` if there is none. */
  @Get('entries/:day')
  get(@CurrentUser() user: AuthUser, @Param('day', dayPipe) day: string) {
    return this.diary.get(user.id, day);
  }

  @Put('entries/:day')
  save(
    @CurrentUser() user: AuthUser,
    @Param('day', dayPipe) day: string,
    @Body(new ZodValidationPipe(diaryEntryInputSchema)) input: DiaryEntryInput,
  ) {
    return this.diary.save(user.id, day, input);
  }

  @Delete('entries/:day')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('day', dayPipe) day: string) {
    return this.diary.remove(user.id, day);
  }

  /** AI summary of entries for a period (requires a configured AI). */
  @Post('summary')
  async summary(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(diarySummaryRequestSchema)) period: DiarySummaryRequest,
  ): Promise<DiarySummary> {
    return { summary: await this.summaries.summarize(user.id, period) };
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.diary.stats(user.id);
  }

  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return this.diary.getSettings(user.id);
  }

  @Put('settings')
  saveSettings(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(diarySettingsSchema)) settings: DiarySettings,
  ) {
    return this.diary.saveSettings(user.id, settings);
  }
}
