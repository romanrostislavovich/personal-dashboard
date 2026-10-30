import {Inject, Injectable, UnauthorizedException} from '@nestjs/common';
import {DB, Database} from '@pd/api-core';
import {and, eq} from 'drizzle-orm';
import {activityDevices, activitySettings} from './activity.schema';

@Injectable()
export class ActivityContextStore {
  constructor(@Inject(DB) private readonly db: Database) {}

  async privateWords(userId: string): Promise<string[]> {
    const [settings] = await this.db
      .select({words: activitySettings.privateWords})
      .from(activitySettings)
      .where(eq(activitySettings.userId, userId));
    return settings?.words ?? [];
  }

  async verifyDevice(userId: string, deviceId: string): Promise<void> {
    const [device] = await this.db
      .select({id: activityDevices.id})
      .from(activityDevices)
      .where(
        and(
          eq(activityDevices.userId, userId),
          eq(activityDevices.id, deviceId),
        ),
      );
    if (!device) throw new UnauthorizedException('Unknown device');
  }
}
