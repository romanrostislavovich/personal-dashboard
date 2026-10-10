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
  PsychologyNoteInput,
  psychologyNoteInputSchema,
  PsychologyPatternsQuery,
  psychologyPatternsQuerySchema,
  PsychologyReflectionAnswers,
  psychologyReflectionAnswersSchema,
  PsychologySettingsInput,
  psychologySettingsSchema,
} from '@pd/contracts';
import { PsychologyService, ValidEventInput } from './psychology.service';
import { ReflectionsService } from './reflections.service';

/** Psychology: patterns of the mood, reflection, notes, check-ups and events. */
@Controller('psychology')
export class PsychologyController {
  constructor(
    private readonly psychology: PsychologyService,
    private readonly reflections: ReflectionsService,
  ) {}

  @Get('patterns')
  patterns(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(psychologyPatternsQuerySchema)) query: PsychologyPatternsQuery,
  ) {
    return this.psychology.patterns(user.id, query);
  }

  // --- Notes ---

  @Get('notes')
  notes(@CurrentUser() user: AuthUser) {
    return this.psychology.notes(user.id);
  }

  @Post('notes')
  @HttpCode(204)
  addNote(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(psychologyNoteInputSchema)) input: PsychologyNoteInput,
  ) {
    return this.psychology.addNote(user.id, input);
  }

  @Put('notes/:id')
  @HttpCode(204)
  updateNote(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(psychologyNoteInputSchema)) input: PsychologyNoteInput,
  ) {
    return this.psychology.updateNote(user.id, id, input);
  }

  @Delete('notes/:id')
  @HttpCode(204)
  removeNote(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.psychology.removeNote(user.id, id);
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

  // --- Reflection ---

  @Get('reflections')
  reflectionList(@CurrentUser() user: AuthUser) {
    return this.reflections.list(user.id);
  }

  /** The questions of this week: written now if there are none yet (the AI may take a while). */
  @Post('reflections/this-week')
  thisWeek(@CurrentUser() user: AuthUser) {
    return this.reflections.forThisWeek(user.id);
  }

  @Put('reflections/:id')
  answer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(psychologyReflectionAnswersSchema))
    body: PsychologyReflectionAnswers,
  ) {
    return this.reflections.answer(user.id, id, body.answers);
  }

  @Delete('reflections/:id')
  @HttpCode(204)
  removeReflection(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reflections.remove(user.id, id);
  }

  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return this.reflections.settings(user.id);
  }

  @Put('settings')
  @HttpCode(204)
  saveSettings(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(psychologySettingsSchema)) settings: PsychologySettingsInput,
  ) {
    return this.reflections.saveSettings(user.id, settings);
  }
}
