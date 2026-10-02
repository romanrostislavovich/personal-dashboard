import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, PERIOD_PARAMETERS } from '@pd/api-core';
import { activityDaySchema, activityPeriodSchema } from '@pd/contracts';
import { ActivityService } from './activity.service';

/** AI access to the time at the computer: per program, category, project and window title. */
@Injectable()
export class ActivityAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly activity: ActivityService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'activity_stats',
      module: 'activity',
      description:
        'Time at the computer for a period, in seconds: `totalSeconds`, per day (`days`), per ' +
        'program (`apps`, with its category), per category (development, browsing, ' +
        'communication, office, design, games, media, system, other), per project (`projects` ' +
        '— time whose window title matched the project), per device, and the window titles ' +
        'that took the most time (`titles`). Useful for "how long did I work yesterday", ' +
        '"what did I spend the week on", "how much did I play".',
      parameters: PERIOD_PARAMETERS,
      handler: (userId, args) => this.activity.stats(userId, activityPeriodSchema.parse(args)),
    });

    this.ai.registerTool({
      name: 'activity_timeline',
      module: 'activity',
      description:
        'What was in front on one day, newest first: program, window title, category, start ' +
        'and end. Useful for "what was I doing at 3 pm", "when did I start working".',
      parameters: {
        type: 'object',
        properties: { day: { type: 'string', description: 'The day, YYYY-MM-DD' } },
        required: ['day'],
      },
      handler: (userId, args) => this.activity.timeline(userId, activityDaySchema.parse(args)),
    });
  }
}
