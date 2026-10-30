import {Module} from '@nestjs/common';
import {DocumentReaderService} from './documents/document-reader.service';
import {HealthTelegram} from './documents/health-telegram';
import {HealthAchievements} from './health.achievements';
import {HealthAiTools} from './health.ai-tools';
import {HealthController} from './health.controller';
import {HealthDemo} from './health.demo';
import {HealthDigest} from './health.digest';
import {HealthLinks} from './health.links';
import {HealthSearch} from './health.search';
import {HealthServerActions} from './health.server-actions';
import {HealthService} from './health.service';
import {IcdDictionaryService} from './icd/icd-dictionary.service';
import {IntakesJobs} from './intakes/intakes.jobs';
import {IntakesService} from './intakes/intakes.service';
import {LabsService} from './labs.service';
import {ProfileController} from './profile/profile.controller';
import {ProfileService} from './profile/profile.service';
import {SharedSummaryController} from './summary/shared.controller';
import {SummaryController} from './summary/summary.controller';
import {SummaryService} from './summary/summary.service';
import {HealthRecall} from './health.recall';
import {BandDaysService} from './wearable/band-days.service';
import {BandAiTools} from './wearable/band.ai-tools';
import {BandController} from './wearable/band.controller';
import {BandService} from './wearable/band.service';
import {WearableController} from './wearable/wearable.controller';
import {WearableIntegrations} from './wearable/wearable.integrations';
import {WearableJob} from './wearable/wearable.job';
import {WearableLinks} from './wearable/wearable.links';
import {WearableService} from './wearable/wearable.service';

/**
 * Health: one medical history across countries and clinics — visits, diagnoses by ICD code,
 * medications and their documents, stored encrypted. API: `/api/medical`. The plan of the
 * module is in docs/health.md.
 */
@Module({
  controllers: [
    HealthController,
    ProfileController,
    SummaryController,
    SharedSummaryController,
    WearableController,
    BandController,
  ],
  providers: [
    HealthService,
    LabsService,
    IcdDictionaryService,
    HealthServerActions,
    HealthAiTools,
    DocumentReaderService,
    HealthTelegram,
    SummaryService,
    HealthLinks,
    HealthDigest,
    HealthSearch,
    HealthRecall,
    HealthDemo,
    ProfileService,
    IntakesService,
    IntakesJobs,
    HealthAchievements,
    WearableService,
    WearableJob,
    WearableLinks,
    WearableIntegrations,
    BandDaysService,
    BandService,
    BandAiTools,
  ],
})
export class HealthModule {}
