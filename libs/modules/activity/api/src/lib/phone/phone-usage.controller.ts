import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, Public, ZodValidationPipe } from '@pd/api-core';
import {
  PhoneUnlockIngest,
  phoneUnlockIngestSchema,
  PhoneUsage,
  PhoneUsageQuery,
  phoneUsageQuerySchema,
} from '@pd/contracts';
import { DevicesService } from '../devices.service';
import { PhoneUsageService } from './phone-usage.service';

/**
 * How the phone is used: the Android app sends its unlocks with its device token; Activity →
 * Phone reads them with the night.
 */
@Controller('activity')
export class PhoneUsageController {
  constructor(
    private readonly devices: DevicesService,
    private readonly phone: PhoneUsageService,
  ) {}

  @Public()
  @Post('device/unlocks')
  async ingest(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(phoneUnlockIngestSchema)) body: PhoneUnlockIngest,
  ): Promise<{ saved: number }> {
    const device = await this.devices.authenticate(authorization);
    return { saved: await this.phone.ingest(device, body.unlocks) };
  }

  @Get('phone')
  usage(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(phoneUsageQuerySchema)) query: PhoneUsageQuery,
  ): Promise<PhoneUsage> {
    return this.phone.usage(user.id, query);
  }
}
