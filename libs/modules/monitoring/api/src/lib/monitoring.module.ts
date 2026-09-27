import { Module } from '@nestjs/common';
import { MonitoringAiTools } from './monitoring.ai-tools';
import { MonitoringAchievements } from './monitoring.achievements';
import { CheckerService } from './checker.service';
import { MonitoringController } from './monitoring.controller';
import { MonitoringJobs } from './monitoring.jobs';
import { MonitorsService } from './monitors.service';

/**
 * Production project monitoring: availability, response time, SSL certificates.
 * API: `/api/monitoring/*`.
 */
@Module({
  controllers: [MonitoringController],
  providers: [
    MonitorsService,
    CheckerService,
    MonitoringJobs,
    MonitoringAchievements,
    MonitoringAiTools,
  ],
})
export class MonitoringModule {}
