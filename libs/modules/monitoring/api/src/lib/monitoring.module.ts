import { Module } from '@nestjs/common';
import { CheckerService } from './checker.service';
import { MonitoringController } from './monitoring.controller';
import { MonitoringJobs } from './monitoring.jobs';
import { MonitorsService } from './monitors.service';

/**
 * Мониторинг продакшн-проектов: доступность, время ответа, SSL-сертификаты.
 * API: `/api/monitoring/*`.
 */
@Module({
  controllers: [MonitoringController],
  providers: [MonitorsService, CheckerService, MonitoringJobs],
})
export class MonitoringModule {}
