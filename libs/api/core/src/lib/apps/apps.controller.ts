import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { AppInstallReport, appInstallReportSchema, AppsOverview } from '@pd/contracts';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { AppsService } from './apps.service';

/** Settings → Apps; the apps report themselves through `installs`. */
@Controller('apps')
export class AppsController {
  constructor(private readonly apps: AppsService) {}

  @Get()
  overview(@CurrentUser() user: AuthUser): Promise<AppsOverview> {
    return this.apps.overview(user.id);
  }

  @Post('installs')
  @HttpCode(204)
  report(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(appInstallReportSchema)) report: AppInstallReport,
  ): Promise<void> {
    return this.apps.report(user.id, report);
  }

  @Delete('installs/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.apps.remove(user.id, id);
  }
}
