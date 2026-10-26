import { Body, Controller, Headers, HttpCode, Inject, Post } from '@nestjs/common';
import { DB, Database, Public, ZodValidationPipe } from '@pd/api-core';
import { PhoneSecurity, phoneSecuritySchema } from '@pd/contracts';
import { DevicesService } from '../devices.service';
import { activityPhoneSecurity } from './phone-security.schema';

/**
 * The phone's daily security report (Security → Phone), with its device token: only the latest is
 * kept, the security agent reads it at its next scan.
 */
@Controller('activity/device')
export class PhoneSecurityController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly devices: DevicesService,
  ) {}

  @Public()
  @Post('security')
  @HttpCode(204)
  async report(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(phoneSecuritySchema)) report: PhoneSecurity,
  ): Promise<void> {
    const device = await this.devices.authenticate(authorization);
    const at = new Date(report.at);
    await this.db
      .insert(activityPhoneSecurity)
      .values({ userId: device.userId, deviceId: device.id, at, report })
      .onConflictDoUpdate({ target: activityPhoneSecurity.deviceId, set: { at, report } });
  }
}
