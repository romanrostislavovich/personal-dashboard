import { Module } from '@nestjs/common';
import { ActivityAutomations } from './activity.automations';
import { ActivityLife } from './activity.life';
import { ActivityLinks } from './activity.links';
import { ActivitySecurity } from './activity.security';
import { ActivityAchievements } from './activity.achievements';
import { ActivityAiTools } from './activity.ai-tools';
import { ActivityController } from './activity.controller';
import { ActivityDigest } from './activity.digest';
import { ActivityJobs } from './activity.jobs';
import { EveningSummaryJob } from './evening-summary.job';
import { ActivityService } from './activity.service';
import { DevicesService } from './devices.service';
import { DiskAdviceService } from './disk/disk-advice.service';
import { WellbeingService } from './wellbeing.service';

/**
 * Activity: time at the computer per program, category and project, focus sessions, daily
 * limits and the health of the computers. The numbers come from
 * trackers — the desktop shell (apps/desktop/src/activity), later a phone — which report with a
 * token of their own. API: `/api/activity`.
 */
@Module({
  controllers: [ActivityController],
  providers: [
    ActivityAutomations,
    ActivityLife,
    ActivityLinks,
    ActivitySecurity,
    ActivityService,
    DevicesService,
    ActivityAchievements,
    ActivityAiTools,
    ActivityDigest,
    ActivityJobs,
    WellbeingService,
    DiskAdviceService,
    EveningSummaryJob,
  ],
})
export class ActivityModule {}
