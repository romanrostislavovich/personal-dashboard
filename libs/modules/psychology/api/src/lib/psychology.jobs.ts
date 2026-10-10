import { Injectable, OnModuleInit } from '@nestjs/common';
import { LinksService, SchedulerService } from '@pd/api-core';
import { ReflectionsService } from './reflections.service';

/**
 * The Sunday questions about the week, and the section's pages for the assistant's links.
 */
@Injectable()
export class PsychologyJobs implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly links: LinksService,
    private readonly reflections: ReflectionsService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'psychology.weekly-review',
      // Sunday evening: the week is behind, the next one has not begun.
      cron: '0 18 * * 0',
      handler: () => this.reflections.sendWeekly(),
    });

    this.links.registerPages([
      { module: 'psychology', path: '/psychology/patterns', description: 'patterns of the mood' },
      {
        module: 'psychology',
        path: '/psychology/reflection',
        description: 'questions of the week',
      },
      { module: 'psychology', path: '/psychology/notes', description: 'notes about oneself' },
      {
        module: 'psychology',
        path: '/psychology/checkups',
        description: 'questionnaires over time',
      },
      { module: 'psychology', path: '/psychology/events', description: 'events of a life, export' },
    ]);
  }
}
