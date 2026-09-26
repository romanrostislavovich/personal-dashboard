import { Body, Controller, Delete, Get, HttpCode, Param, Put, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, ZodValidationPipe } from '@pd/api-core';
import {
  DiaryEntryInput,
  diaryEntryInputSchema,
  DiaryQuery,
  diaryQuerySchema,
  DiarySettings,
  diarySettingsSchema,
} from '@pd/contracts';
import { z } from 'zod';
import { DiaryService } from './diary.service';

/** `:day` — дата записи `YYYY-MM-DD`. */
const dayPipe = new ZodValidationPipe(z.iso.date());

@Controller('diary')
export class DiaryController {
  constructor(private readonly diary: DiaryService) {}

  @Get('entries')
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(diaryQuerySchema)) query: DiaryQuery,
  ) {
    return this.diary.list(user.id, query);
  }

  /** Запись дня или `null`, если её нет. */
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
