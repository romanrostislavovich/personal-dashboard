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
import { AuthUser, CurrentUser, ZodValidationPipe } from '@pd/api-core';
import { MonitorInput, monitorInputSchema } from '@pd/contracts';
import { CheckerService } from './checker.service';
import { MonitorsService } from './monitors.service';

@Controller('monitoring')
export class MonitoringController {
  constructor(
    private readonly monitors: MonitorsService,
    private readonly checker: CheckerService,
  ) {}

  @Get('monitors')
  list(@CurrentUser() user: AuthUser) {
    return this.monitors.list(user.id);
  }

  @Post('monitors')
  @HttpCode(204)
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(monitorInputSchema)) input: MonitorInput,
  ) {
    const monitor = await this.monitors.create(user.id, input);
    await this.checker.checkNew(monitor);
  }

  @Delete('monitors/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.monitors.remove(user.id, id);
  }
}
