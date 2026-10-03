import { Injectable, OnModuleInit } from '@nestjs/common';
import { AutomationsService } from '@pd/api-core';

/** Activity in the rules "if X, then Y": a daily limit is reached. */
@Injectable()
export class ActivityAutomations implements OnModuleInit {
  constructor(private readonly automations: AutomationsService) {}

  onModuleInit(): void {
    this.automations.registerTrigger({
      id: 'activity.limit',
      module: 'activity',
      labelKey: 'activity.automations.limit',
      description:
        'A daily limit of time at the computer (games, the whole day or a program) is reached',
      params: [],
      variables: ['what', 'minutes'],
    });
  }
}
