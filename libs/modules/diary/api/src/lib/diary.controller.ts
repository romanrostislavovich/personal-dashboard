import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser, CurrentUser, ZodValidationPipe } from '@pd/api-core';
import {
  DIARY_PHOTO_MAX_BYTES,
  diaryCalendarQuerySchema,
  DiaryEntryInput,
  diaryEntryInputSchema,
  diaryMarksQuerySchema,
  DiaryQuery,
  diaryQuerySchema,
  diarySearchQuerySchema,
  DiarySettings,
  diarySettingsSchema,
  DiarySummary,
  DiarySummaryRequest,
  diarySummaryRequestSchema,
} from '@pd/contracts';
import { z } from 'zod';
import { DiaryPhotosService } from './diary-photos.service';
import { DiarySummaryService } from './diary-summary.service';
import { DiaryService } from './diary.service';

/** `:day` is the entry date `YYYY-MM-DD`. */
const dayPipe = new ZodValidationPipe(z.iso.date());

/** The part of a multer upload we use (multer's own types are not installed). */
interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
}

@Controller('diary')
export class DiaryController {
  constructor(
    private readonly diary: DiaryService,
    private readonly photos: DiaryPhotosService,
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

  /** Deletes the whole diary; the web asks to type a word first. */
  @Delete()
  @HttpCode(204)
  removeAll(@CurrentUser() user: AuthUser) {
    return this.diary.removeAll(user.id);
  }

  @Get('search')
  search(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(diarySearchQuerySchema)) { q }: { q: string },
  ) {
    return this.diary.search(user.id, q);
  }

  /** All fragments marked with the emoji: `GET /diary/marks?emoji=🔥`. */
  @Get('marks')
  marks(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(diaryMarksQuerySchema)) { emoji }: { emoji: string },
  ) {
    return this.diary.marks(user.id, emoji);
  }

  @Get('calendar')
  calendar(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(diaryCalendarQuerySchema)) { year }: { year: number },
  ) {
    return this.diary.calendar(user.id, year);
  }

  /** Entries from the same date a month ago and in previous years. */
  @Get('memories/:day')
  memories(@CurrentUser() user: AuthUser, @Param('day', dayPipe) day: string) {
    return this.diary.memories(user.id, day);
  }

  @Get('insights')
  insights(@CurrentUser() user: AuthUser) {
    return this.diary.insights(user.id);
  }

  // --- Photos ---

  @Get('entries/:day/photos')
  listPhotos(@CurrentUser() user: AuthUser, @Param('day', dayPipe) day: string) {
    return this.photos.list(user.id, day);
  }

  @Post('entries/:day/photos')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: DIARY_PHOTO_MAX_BYTES } }))
  addPhoto(
    @CurrentUser() user: AuthUser,
    @Param('day', dayPipe) day: string,
    @UploadedFile() file: UploadedImage | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Expected an image in the "file" field');
    }
    return this.photos.add(user.id, day, { data: file.buffer, mimeType: file.mimetype });
  }

  /** The image itself. The browser loads it with the auth header, so it is fetched as a blob. */
  @Get('photos/:id')
  @Header('Cache-Control', 'private, max-age=86400')
  async photo(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const { data, mimeType } = await this.photos.file(user.id, id);
    return new StreamableFile(data, { type: mimeType });
  }

  @Delete('photos/:id')
  @HttpCode(204)
  removePhoto(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.photos.remove(user.id, id);
  }

  // --- AI and settings ---

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
