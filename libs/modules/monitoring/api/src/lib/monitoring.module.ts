import { MonitoringDemo } from './monitoring.demo';
import { Module } from '@nestjs/common';
import { MonitoringAutomations } from './monitoring.automations';
import { MonitoringLinks } from './monitoring.links';
import { MonitoringSearch } from './monitoring.search';
import { MonitoringAiTools } from './monitoring.ai-tools';
import { MonitoringDigest } from './monitoring.digest';
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
    MonitoringAutomations,
    MonitoringDemo,
    MonitoringLinks,
    MonitoringSearch,
    MonitorsService,
    CheckerService,
    MonitoringJobs,
    MonitoringAchievements,
    MonitoringAiTools,
    MonitoringDigest,
  ],
})
export class MonitoringModule {}
