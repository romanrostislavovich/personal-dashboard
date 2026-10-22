import { Injectable, OnModuleInit } from '@nestjs/common';
import { forEachUser, SchedulerService } from '@pd/api-core';
import { RuleSuggestionsService } from './rule-suggestions.service';
import { WellbeingService } from './wellbeing.service';

/**
 * Background work of the Activity section: the health of the computers is kept for a month,
 * and once a day the windows and sites around work on projects are looked at for rules to offer.
 */
@Injectable()
export class ActivityJobs implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly wellbeing: WellbeingService,
    private readonly suggestions: RuleSuggestionsService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'activity.health-cleanup',
      cron: '40 4 * * *',
      handler: () => this.wellbeing.deleteOldHealth(),
    });
    this.scheduler.register({
      name: 'activity.rule-suggestions',
      cron: '10 5 * * *',
      handler: async () =>
        forEachUser('activity.rule-suggestions', await this.suggestions.activeUserIds(), (userId) =>
          this.suggestions.refresh(userId),
        ),
    });
  }
}
