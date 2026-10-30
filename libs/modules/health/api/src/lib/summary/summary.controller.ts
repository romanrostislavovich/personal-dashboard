import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
} from '@nestjs/common';
import {AuthUser, CurrentUser, ZodValidationPipe} from '@pd/api-core';
import {
  HealthSummaryOptions,
  healthSummaryOptionsSchema,
  healthShareInputSchema,
} from '@pd/contracts';
import {SummaryService, ValidShareInput} from './summary.service';

const DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** The summary for a new doctor: a page to print, a Word document, links. */
@Controller('medical')
export class SummaryController {
  constructor(private readonly summaries: SummaryService) {}

  /** The page to print or save as PDF; the options travel in the body, not in an address. */
  @Post('summary/html')
  @HttpCode(200)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  html(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(healthSummaryOptionsSchema))
    options: HealthSummaryOptions,
  ) {
    return this.summaries.html(user.id, options);
  }

  @Post('summary/docx')
  @HttpCode(200)
  async docx(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(healthSummaryOptionsSchema))
    options: HealthSummaryOptions,
  ): Promise<StreamableFile> {
    const file = await this.summaries.docx(user.id, options);
    return new StreamableFile(file, {
      type: DOCX,
      length: file.length,
      disposition: 'attachment; filename="medical-summary.docx"',
    });
  }

  @Get('shares')
  shares(@CurrentUser() user: AuthUser) {
    return this.summaries.shares(user.id);
  }

  @Post('shares')
  share(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(healthShareInputSchema)) input: ValidShareInput,
  ) {
    return this.summaries.share(user.id, input);
  }

  /** Revokes it: the link stops working at once. */
  @Delete('shares/:id')
  @HttpCode(204)
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.summaries.revoke(user.id, id);
  }
}
