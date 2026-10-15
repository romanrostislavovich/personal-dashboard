import { Module } from '@nestjs/common';
import { PsychologyAchievements } from './psychology.achievements';
import { PsychologyAiTools } from './psychology.ai-tools';
import { PsychologyController } from './psychology.controller';
import { PsychologyDemo } from './psychology.demo';
import { PsychologyLinks } from './psychology.links';
import { PsychologyReminders } from './psychology.reminders';
import { PsychologyService } from './psychology.service';

/**
 * Psychology: watching oneself over time. Patterns of the mood (the diary's, through the
 * core), short standard questionnaires and the events of a life with an export to Excel and
 * Word. Self-observation, not a diagnosis. API: `/api/psychology`.
 */
@Module({
  controllers: [PsychologyController],
  providers: [
    PsychologyService,
    PsychologyAiTools,
    PsychologyLinks,
    PsychologyDemo,
    PsychologyAchievements,
    PsychologyReminders,
  ],
})
export class PsychologyModule {}
