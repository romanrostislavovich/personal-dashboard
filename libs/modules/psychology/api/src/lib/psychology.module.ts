import { Module } from '@nestjs/common';
import { PsychologyAiTools } from './psychology.ai-tools';
import { PsychologyController } from './psychology.controller';
import { PsychologyDemo } from './psychology.demo';
import { PsychologyJobs } from './psychology.jobs';
import { PsychologyService } from './psychology.service';
import { ReflectionsService } from './reflections.service';

/**
 * Psychology: watching oneself over time. Patterns of the mood (the diary's, through the
 * core), a few questions about the week, notes about oneself, short standard questionnaires
 * and the events of a life with an export to Excel and Word. Self-observation, not a
 * diagnosis. API: `/api/psychology`.
 */
@Module({
  controllers: [PsychologyController],
  providers: [
    PsychologyService,
    ReflectionsService,
    PsychologyAiTools,
    PsychologyJobs,
    PsychologyDemo,
  ],
})
export class PsychologyModule {}
