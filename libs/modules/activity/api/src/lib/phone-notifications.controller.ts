import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, Public, ZodValidationPipe } from '@pd/api-core';
import {
  PhoneNotificationIngest,
  phoneNotificationIngestSchema,
  PhoneNotificationsQuery,
  phoneNotificationsQuerySchema,
  PhoneNotificationsSummary,
} from '@pd/contracts';
import { DevicesService } from './devices.service';
import { PhoneNotificationsService } from './phone-notifications.service';

/**
 * The phone's notifications: the Android app sends them with its device token, like a computer
 * sends its spans; Activity → Notifications reads the summary.
 */
@Controller('activity')
export class PhoneNotificationsController {
  constructor(
    private readonly devices: DevicesService,
    private readonly notifications: PhoneNotificationsService,
  ) {}

  @Public()
  @Post('device/notifications')
  async ingest(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(phoneNotificationIngestSchema)) body: PhoneNotificationIngest,
  ): Promise<{ saved: number }> {
    const device = await this.devices.authenticate(authorization);
    return { saved: await this.notifications.ingest(device, body.notifications) };
  }

  @Get('notifications')
  summary(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(phoneNotificationsQuerySchema)) query: PhoneNotificationsQuery,
  ): Promise<PhoneNotificationsSummary> {
    return this.notifications.summary(user.id, query);
  }
}
