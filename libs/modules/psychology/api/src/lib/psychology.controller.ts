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
  Query,
  StreamableFile,
} from '@nestjs/common';
import { AuthUser, CurrentUser, ZodValidationPipe } from '@pd/api-core';
import {
  PsychologyAssessmentInput,
  psychologyAssessmentInputSchema,
  PsychologyEventExport,
  psychologyEventExportSchema,
  psychologyEventInputSchema,
  PsychologyPatternsQuery,
  psychologyPatternsQuerySchema,
  PsychologySettingsInput,
  psychologySettingsSchema,
} from '@pd/contracts';
import { PsychologyService, ValidEventInput } from './psychology.service';

/** Psychology: patterns of the mood, check-ups and events. */
@Controller('psychology')
export class PsychologyController {
  constructor(private readonly psychology: PsychologyService) {}

  @Get('patterns')
  patterns(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(psychologyPatternsQuerySchema)) query: PsychologyPatternsQuery,
  ) {
    return this.psychology.patterns(user.id, query);
  }

  // --- Events ---

  @Get('events')
  events(@CurrentUser() user: AuthUser) {
    return this.psychology.events(user.id);
  }

  /** The events of a period as an Excel workbook (`xlsx`) or a Word document (`docx`). */
  @Get('events/export')
  async exportEvents(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(psychologyEventExportSchema)) query: PsychologyEventExport,
  ): Promise<StreamableFile> {
    const { file, name, type } = await this.psychology.exportEvents(user.id, query.format, query);
    return new StreamableFile(file, {
      type,
      length: file.length,
      disposition: `attachment; filename="${name}"`,
    });
  }

  @Post('events')
  addEvent(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(psychologyEventInputSchema)) input: ValidEventInput,
  ) {
    return this.psychology.addEvent(user.id, input);
  }

  @Put('events/:id')
  updateEvent(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(psychologyEventInputSchema)) input: ValidEventInput,
  ) {
    return this.psychology.updateEvent(user.id, id, input);
  }

  @Delete('events/:id')
  @HttpCode(204)
  removeEvent(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.psychology.removeEvent(user.id, id);
  }

  // --- Check-ups ---

  @Get('assessments')
  assessments(@CurrentUser() user: AuthUser) {
    return this.psychology.assessments(user.id);
  }

  @Post('assessments')
  addAssessment(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(psychologyAssessmentInputSchema)) input: PsychologyAssessmentInput,
  ) {
    return this.psychology.addAssessment(user.id, input);
  }

  @Delete('assessments/:id')
  @HttpCode(204)
  removeAssessment(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.psychology.removeAssessment(user.id, id);
  }

  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return this.psychology.settings(user.id);
  }

  @Put('settings')
  @HttpCode(204)
  saveSettings(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(psychologySettingsSchema)) settings: PsychologySettingsInput,
  ) {
    return this.psychology.saveSettings(user.id, settings);
  }
}
