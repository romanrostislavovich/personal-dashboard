import {Module} from '@nestjs/common';
import {BriefController} from './brief.controller';
import {BriefService} from './brief.service';
import {GentleDayController} from './gentle-day.controller';
import {GentleDayService} from './gentle-day.service';
import {PsychologyAchievements} from './psychology.achievements';
import {PsychologyAiTools} from './psychology.ai-tools';
import {PsychologyController} from './psychology.controller';
import {PsychologyDemo} from './psychology.demo';
import {PsychologyLinks} from './psychology.links';
import {PsychologyReminders} from './psychology.reminders';
import {PsychologyService} from './psychology.service';
import {PsychologyRecall} from './psychology.recall';

/**
 * Psychology: watching oneself over time. Patterns of the mood (the diary's, through the
 * core), short standard questionnaires and the events of a life with an export to Excel and
 * Word, a gentle day for hard days and briefs for an appointment with a specialist.
 * Self-observation, not a diagnosis. API: `/api/psychology`.
 */
@Module({
  controllers: [PsychologyController, GentleDayController, BriefController],
  providers: [
    PsychologyService,
    PsychologyAiTools,
    PsychologyLinks,
    PsychologyDemo,
    PsychologyAchievements,
    PsychologyReminders,
    PsychologyRecall,
    GentleDayService,
    BriefService,
  ],
})
export class PsychologyModule {}
