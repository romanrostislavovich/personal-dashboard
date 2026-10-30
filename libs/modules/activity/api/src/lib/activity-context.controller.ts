import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {AuthUser, CurrentUser, Public, ZodValidationPipe} from '@pd/api-core';
import {
  TelemetryIngest,
  telemetryIngestSchema,
  TelemetryQuery,
  telemetryQuerySchema,
  WorkstateInput,
  workstateInputSchema,
  WorkstateQuery,
  workstateQuerySchema,
  workstateRestoreRequestSchema,
} from '@pd/contracts';
import {DevicesService} from './devices.service';
import {TelemetryService} from './telemetry.service';
import {WorkstateService} from './workstate.service';

@Controller('activity')
export class ActivityContextController {
  constructor(
    private readonly telemetry: TelemetryService,
    private readonly workstates: WorkstateService,
    private readonly devices: DevicesService,
  ) {}

  @Public()
  @Post('ingest/telemetry')
  async ingestTelemetry(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(telemetryIngestSchema)) body: TelemetryIngest,
  ) {
    const device = await this.devices.authenticate(authorization);
    return this.telemetry.record(device.userId, body, device.id);
  }

  @Post('telemetry')
  recordTelemetry(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(telemetryIngestSchema)) body: TelemetryIngest,
  ) {
    return this.telemetry.record(user.id, body);
  }

  @Get('telemetry')
  listTelemetry(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(telemetryQuerySchema)) query: TelemetryQuery,
  ) {
    return this.telemetry.list(user.id, query);
  }

  @Delete('telemetry/expired')
  @HttpCode(204)
  pruneTelemetry(@CurrentUser() user: AuthUser) {
    return this.telemetry.deleteOld(user.id);
  }

  @Delete('telemetry/:id')
  @HttpCode(204)
  removeTelemetry(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.telemetry.remove(user.id, id);
  }

  @Delete('telemetry')
  @HttpCode(204)
  clearTelemetry(@CurrentUser() user: AuthUser) {
    return this.telemetry.clear(user.id);
  }

  @Public()
  @Post('ingest/workstates')
  async ingestWorkstate(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(workstateInputSchema)) body: WorkstateInput,
  ) {
    const device = await this.devices.authenticate(authorization);
    return this.workstates.capture(device.userId, body, device.id);
  }

  @Post('workstates')
  captureWorkstate(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(workstateInputSchema)) body: WorkstateInput,
  ) {
    return this.workstates.capture(user.id, body);
  }

  @Get('workstates')
  listWorkstates(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(workstateQuerySchema)) query: WorkstateQuery,
  ) {
    return this.workstates.list(user.id, query);
  }

  @Get('workstates/:id')
  getWorkstate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workstates.get(user.id, id);
  }

  @Post('workstates/:id/restore')
  @HttpCode(200)
  restoreWorkstate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(workstateRestoreRequestSchema))
    _body: Record<string, never>,
  ) {
    return this.workstates.restore(user.id, id, _body);
  }

  @Delete('workstates/expired')
  @HttpCode(204)
  pruneWorkstates(@CurrentUser() user: AuthUser) {
    return this.workstates.deleteOld(user.id);
  }

  @Delete('workstates/:id')
  @HttpCode(204)
  removeWorkstate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workstates.remove(user.id, id);
  }

  @Delete('workstates')
  @HttpCode(204)
  clearWorkstates(@CurrentUser() user: AuthUser) {
    return this.workstates.clear(user.id);
  }
}
