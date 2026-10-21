import { Injectable, OnModuleInit } from '@nestjs/common';
import { RecallService } from '@pd/api-core';
import { PsychologyService } from './psychology.service';

/** The events of a life in search by meaning. */
@Injectable()
export class PsychologyRecall implements OnModuleInit {
  constructor(
    private readonly recall: RecallService,
    private readonly psychology: PsychologyService,
  ) {}

  onModuleInit(): void {
    this.recall.register({
      module: 'psychology',
      items: async (userId) =>
        (await this.psychology.events(userId)).map((event) => ({
          id: event.id,
          title: event.title,
          text: [event.title, event.description].filter(Boolean).join('\n'),
          date: event.startedOn,
          link: '/psychology',
        })),
    });
  }
}
