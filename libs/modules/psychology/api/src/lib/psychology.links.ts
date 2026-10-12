import { Injectable, OnModuleInit } from '@nestjs/common';
import { LinksService } from '@pd/api-core';

/** The section's pages for the assistant's links. */
@Injectable()
export class PsychologyLinks implements OnModuleInit {
  constructor(private readonly links: LinksService) {}

  onModuleInit(): void {
    this.links.registerPages([
      { module: 'psychology', path: '/psychology/patterns', description: 'patterns of the mood' },
      {
        module: 'psychology',
        path: '/psychology/checkups',
        description: 'questionnaires over time',
      },
      { module: 'psychology', path: '/psychology/events', description: 'events of a life, export' },
    ]);
  }
}
