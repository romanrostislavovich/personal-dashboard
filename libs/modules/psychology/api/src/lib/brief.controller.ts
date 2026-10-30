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
  StreamableFile,
} from '@nestjs/common';
import {AuthUser, CurrentUser, ZodValidationPipe} from '@pd/api-core';
import {appointmentBriefInputSchema} from '@pd/contracts';
import {BriefService, ValidBriefInput} from './brief.service';

/** Briefs for an appointment with a specialist. */
@Controller('psychology/briefs')
export class BriefController {
  constructor(private readonly briefs: BriefService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.briefs.list(user.id);
  }

  @Post()
  add(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(appointmentBriefInputSchema))
    input: ValidBriefInput,
  ) {
    return this.briefs.add(user.id, input);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(appointmentBriefInputSchema))
    input: ValidBriefInput,
  ) {
    return this.briefs.update(user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.briefs.remove(user.id, id);
  }

  /** The brief as a Word document. */
  @Get(':id/export')
  async export(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const {file, name, type} = await this.briefs.export(user.id, id);
    return new StreamableFile(file, {
      type,
      length: file.length,
      disposition: `attachment; filename="${name}"`,
    });
  }
}
