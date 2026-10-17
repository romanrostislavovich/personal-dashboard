import { Body, Controller, Delete, Get, HttpCode, Post, Put } from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
  RateLimit,
  ServerKeysService,
  ZodValidationPipe,
} from '@pd/api-core';
import {
  LanguageToolInput,
  languageToolInputSchema,
  WritingCheck,
  WritingCheckResult,
  writingCheckSchema,
  WritingConfig,
  WritingIgnore,
  writingIgnoreSchema,
  WritingRewrite,
  WritingRewriteInput,
  writingRewriteSchema,
  WritingSettingsUpdate,
  writingSettingsUpdateSchema,
} from '@pd/contracts';
import { WritingService } from './writing.service';

/**
 * `/api/writing`: the check as one types (the page, the browser extension, the desktop app),
 * the AI's rewrite, and the settings with the dictionary.
 */
@Controller('writing')
export class WritingController {
  constructor(
    private readonly writing: WritingService,
    private readonly keys: ServerKeysService,
  ) {}

  /** The owner sets the LanguageTool server, once for every user. */
  @Put('language-tool')
  @HttpCode(204)
  async setLanguageTool(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(languageToolInputSchema)) input: LanguageToolInput,
  ): Promise<void> {
    await this.keys.assertOwner(user.id);
    await this.writing.setLanguageTool(input.url);
  }

  @Delete('language-tool')
  @HttpCode(204)
  async removeLanguageTool(@CurrentUser() user: AuthUser): Promise<void> {
    await this.keys.assertOwner(user.id);
    await this.writing.removeLanguageTool();
  }

  @Get('settings')
  settings(@CurrentUser() user: AuthUser): Promise<WritingConfig> {
    return this.writing.config(user.id);
  }

  @Put('settings')
  saveSettings(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(writingSettingsUpdateSchema)) update: WritingSettingsUpdate,
  ): Promise<WritingConfig> {
    return this.writing.saveSettings(user.id, update);
  }

  /** A word into the dictionary, or a rule switched off. */
  @Post('ignore')
  ignore(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(writingIgnoreSchema)) what: WritingIgnore,
  ): Promise<WritingConfig> {
    return this.writing.ignore(user.id, what);
  }

  /** Checked after every pause in typing: generous, but not endless. */
  @Post('check')
  @HttpCode(200)
  @RateLimit(240, 60)
  check(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(writingCheckSchema)) input: WritingCheck,
  ): Promise<WritingCheckResult> {
    return this.writing.check(user.id, input);
  }

  @Post('rewrite')
  @HttpCode(200)
  @RateLimit(30, 60)
  async rewrite(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(writingRewriteSchema)) input: WritingRewriteInput,
  ): Promise<WritingRewrite> {
    return { text: await this.writing.rewrite(user.id, input) };
  }
}
