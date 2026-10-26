import { ActivityDemo } from './activity.demo';
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
import { PhoneNotificationsController } from './phone-notifications.controller';
import { PhoneNotificationsService } from './phone-notifications.service';
import { PhoneUsageController } from './phone/phone-usage.controller';
import { PhoneVoiceController } from './phone/phone-voice.controller';
import { PhoneUsageLinks } from './phone/phone-usage.links';
import { PhoneSignalsService } from './phone/phone-signals.service';
import { PhoneUsageService } from './phone/phone-usage.service';
import { PlacesController } from './places/places.controller';
import { PlaceNamesService } from './places/place-names.service';
import { PlacesAutomations } from './places/places.automations';
import { PlacesIntegrations } from './places/places.integrations';
import { PlacesLinks } from './places/places.links';
import { PlacesService } from './places/places.service';
import { ProjectTimeService } from './project-time.service';
import { RuleSuggestionsService } from './rule-suggestions.service';
import { SitesService } from './sites.service';
import { DiskAdviceService } from './disk/disk-advice.service';
import { WellbeingService } from './wellbeing.service';
import { ActivityContextController } from './activity-context.controller';
import { ActivityContextJobs } from './activity-context.jobs';
import { ActivityContextStore } from './activity-context.store';
import { TelemetryService } from './telemetry.service';
import { WorkstateService } from './workstate.service';
import { TelemetrySummaryService } from './telemetry-summary.service';

/**
 * Activity: time at the computer per program, category and project, focus sessions, daily
 * limits and the health of the computers. The numbers come from
 * trackers — the desktop shell (apps/desktop/src/activity), later a phone — which report with a
 * token of their own. API: `/api/activity`.
 */
@Module({
  controllers: [
    ActivityController,
    ActivityContextController,
    PhoneNotificationsController,
    PlacesController,
    PhoneUsageController,
    PhoneVoiceController,
  ],
  providers: [
    ActivityContextJobs,
    ActivityContextStore,
    TelemetryService,
    TelemetrySummaryService,
    WorkstateService,
    ActivityAutomations,
    ActivityDemo,
    ActivityLife,
    ActivityLinks,
    ActivitySecurity,
    ActivityService,
    DevicesService,
    PhoneNotificationsService,
    PlacesLinks,
    PlaceNamesService,
    PlacesIntegrations,
    PlacesAutomations,
    PhoneUsageLinks,
    PhoneUsageService,
    PhoneSignalsService,
    PlacesService,
    SitesService,
    ProjectTimeService,
    RuleSuggestionsService,
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
