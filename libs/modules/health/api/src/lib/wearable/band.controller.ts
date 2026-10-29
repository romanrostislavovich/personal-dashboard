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
  Put,
  Query,
} from '@nestjs/common';
import { AuthUser, CurrentUser, DeviceAuthService, Public, ZodValidationPipe } from '@pd/api-core';
import {
  BandDayDetail,
  BandDayQuery,
  bandDayQuerySchema,
  BandIngest,
  bandIngestSchema,
  MindfulnessInput,
  mindfulnessInputSchema,
  ReactionFeelingInput,
  reactionFeelingSchema,
} from '@pd/contracts';
import { BandService } from './band.service';

/** The band through the phone's Health Connect: `/api/medical/band`. */
@Controller('medical/band')
export class BandController {
  constructor(
    private readonly band: BandService,
    private readonly devices: DeviceAuthService,
  ) {}

  /** The phone's upload, with its device token (`Authorization: Device <token>`). */
  @Public()
  @Post('device')
  async ingest(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(bandIngestSchema)) body: BandIngest,
  ): Promise<{ saved: number }> {
    return this.band.ingest(await this.devices.authenticate(authorization), body);
  }

  @Get('day')
  day(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(bandDayQuerySchema)) query: BandDayQuery,
  ): Promise<BandDayDetail> {
    return this.band.day(user.id, query.day);
  }

  @Put('reactions/:id')
  @HttpCode(204)
  feeling(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reactionFeelingSchema)) body: ReactionFeelingInput,
  ): Promise<void> {
    return this.band.setFeeling(user.id, id, body.feeling);
  }

  @Post('mindfulness')
  @HttpCode(204)
  addMindfulness(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(mindfulnessInputSchema)) body: MindfulnessInput,
  ): Promise<void> {
    return this.band.addMindfulness(user.id, body);
  }

  @Delete('mindfulness/:id')
  @HttpCode(204)
  removeMindfulness(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.band.removeMindfulness(user.id, id);
  }
}
