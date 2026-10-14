import { Module } from '@nestjs/common';
import { DocumentReaderService } from './documents/document-reader.service';
import { HealthTelegram } from './documents/health-telegram';
import { HealthAiTools } from './health.ai-tools';
import { HealthController } from './health.controller';
import { HealthDemo } from './health.demo';
import { HealthDigest } from './health.digest';
import { HealthLinks } from './health.links';
import { HealthSearch } from './health.search';
import { HealthServerActions } from './health.server-actions';
import { HealthService } from './health.service';
import { IcdDictionaryService } from './icd/icd-dictionary.service';
import { IntakesJobs } from './intakes/intakes.jobs';
import { IntakesService } from './intakes/intakes.service';
import { LabsService } from './labs.service';
import { ProfileController } from './profile/profile.controller';
import { ProfileService } from './profile/profile.service';
import { SharedSummaryController } from './summary/shared.controller';
import { SummaryController } from './summary/summary.controller';
import { SummaryService } from './summary/summary.service';

/**
 * Health: one medical history across countries and clinics — visits, diagnoses by ICD code,
 * medications and their documents, stored encrypted. API: `/api/medical`. The plan of the
 * module is in docs/health.md.
 */
@Module({
  controllers: [HealthController, ProfileController, SummaryController, SharedSummaryController],
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
    HealthDemo,
    ProfileService,
    IntakesService,
    IntakesJobs,
  ],
})
export class HealthModule {}
