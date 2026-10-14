import { Module } from '@nestjs/common';
import { DocumentReaderService } from './documents/document-reader.service';
import { HealthTelegram } from './documents/health-telegram';
import { HealthAiTools } from './health.ai-tools';
import { HealthController } from './health.controller';
import { HealthServerActions } from './health.server-actions';
import { HealthService } from './health.service';
import { IcdDictionaryService } from './icd/icd-dictionary.service';
import { LabsService } from './labs.service';

/**
 * Health: one medical history across countries and clinics — visits, diagnoses by ICD code,
 * medications and their documents, stored encrypted. API: `/api/medical`. The plan of the
 * module is in docs/health.md.
 */
@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    LabsService,
    IcdDictionaryService,
    HealthServerActions,
    HealthAiTools,
    DocumentReaderService,
    HealthTelegram,
  ],
})
export class HealthModule {}
