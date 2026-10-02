import { Module } from '@nestjs/common';
import { ActivityAchievements } from './activity.achievements';
import { ActivityAiTools } from './activity.ai-tools';
import { ActivityController } from './activity.controller';
import { ActivityDigest } from './activity.digest';
import { ActivityService } from './activity.service';
import { DevicesService } from './devices.service';

/**
 * Activity: time at the computer per program, category and project. The numbers come from
 * trackers — the desktop shell (apps/desktop/src/activity), later a phone — which report with a
 * token of their own. API: `/api/activity`.
 */
@Module({
  controllers: [ActivityController],
  providers: [
    ActivityService,
    DevicesService,
    ActivityAchievements,
    ActivityAiTools,
    ActivityDigest,
  ],
})
export class ActivityModule {}
