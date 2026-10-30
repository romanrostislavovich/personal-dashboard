import {Body, Controller, Get, Headers, Post, Query} from '@nestjs/common';
import {AuthUser, CurrentUser, Public, ZodValidationPipe} from '@pd/api-core';
import {
  PhoneUnlockIngest,
  phoneUnlockIngestSchema,
  PhoneUsage,
  PhoneUsageQuery,
  phoneUsageQuerySchema,
  phoneSignalIngestSchema,
  PhoneSignalsDay,
} from '@pd/contracts';
import {DevicesService} from '../devices.service';
import {z} from 'zod';
import {PhoneSignalsService} from './phone-signals.service';
import {PhoneUsageService} from './phone-usage.service';

/**
 * How the phone is used: the Android app sends its unlocks with its device token; Activity →
 * Phone reads them with the night.
 */
@Controller('activity')
export class PhoneUsageController {
  constructor(
    private readonly devices: DevicesService,
    private readonly phone: PhoneUsageService,
    private readonly signals: PhoneSignalsService,
  ) {}

  @Public()
  @Post('device/unlocks')
  async ingest(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(phoneUnlockIngestSchema))
    body: PhoneUnlockIngest,
  ): Promise<{saved: number}> {
    const device = await this.devices.authenticate(authorization);
    return {saved: await this.phone.ingest(device, body.unlocks)};
  }

  /** The phone's other signals (the screen, steps, calls…, docs/telemetry.md), with its device token. */
  @Public()
  @Post('device/signals')
  async ingestSignals(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(phoneSignalIngestSchema))
    body: z.output<typeof phoneSignalIngestSchema>,
  ): Promise<{saved: number}> {
    const device = await this.devices.authenticate(authorization);
    return this.signals.ingest(device, body);
  }

  /** The numbers of each day from the phone's signals (Activity → Phone). */
  @Get('phone/signals')
  signalDays(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(phoneUsageQuerySchema)) query: PhoneUsageQuery,
  ): Promise<PhoneSignalsDay[]> {
    return this.signals.days(user.id, query);
  }

  @Get('phone')
  usage(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(phoneUsageQuerySchema)) query: PhoneUsageQuery,
  ): Promise<PhoneUsage> {
    return this.phone.usage(user.id, query);
  }
}
