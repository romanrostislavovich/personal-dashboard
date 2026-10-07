import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, PERIOD_PARAMETERS, UsersService } from '@pd/api-core';
import { activityDaySchema, activityPeriodSchema } from '@pd/contracts';
import { z } from 'zod';
import { ActivityLinks } from './activity.links';
import { ActivityService } from './activity.service';
import { digestTimeline } from './timeline-digest';

const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const timelineArgs = activityDaySchema.extend({
  fromTime: TIME.optional(),
  toTime: TIME.optional(),
  limit: z.number().int().min(1).max(200).default(80),
});

/** AI access to the time at the computer: per program, category, project and window title. */
@Injectable()
export class ActivityAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly activity: ActivityService,
    private readonly users: UsersService,
    private readonly links: ActivityLinks,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'activity_focus_music',
      module: 'activity',
      description:
        'Focus sessions (Pomodoro) of a period against the music that played during them ' +
        '(from the listening history): `withMusic` and `withoutMusic` — sessions, focus ' +
        'seconds, percent finished, percent of the time lost to distractions; `artists` — who ' +
        'played in the most sessions. Useful for "what do I listen to when I work", "do I ' +
        'focus better with music". A difference between the two is not a proof of the cause.',
      parameters: PERIOD_PARAMETERS,
      handler: (userId, args) => this.links.focusMusic(userId, activityPeriodSchema.parse(args)),
    });

    this.ai.registerTool({
      name: 'activity_stats',
      module: 'activity',
      description:
        'Time at the computer for a period, in seconds: `totalSeconds`, per day (`days`), per ' +
        'program (`apps`, with its category), per category (development, browsing, ' +
        'communication, office, design, games, media, system, other), per project (`projects` ' +
        '— time whose window title matched the project), per device, and the window titles ' +
        'that took the most time (`titles`). `otherComputers` — computers without the tracker ' +
        '(a work laptop) whose time comes from another service (WakaTime: only the time in an ' +
        'IDE, so the least that was worked there); it is already in the total, the days and ' +
        'development. Useful for "how long did I work yesterday", ' +
        '"what did I spend the week on", "how much did I play".',
      parameters: PERIOD_PARAMETERS,
      handler: (userId, args) => this.activity.stats(userId, activityPeriodSchema.parse(args)),
    });

    this.ai.registerTool({
      name: 'activity_timeline',
      module: 'activity',
      description:
        'What was in front on one day, oldest first, as stretches in one window: from and to ' +
        "on the user's clock (HH:mm), minutes, program, window title, category. Useful for " +
        '"what was I doing at 3 pm", "when did I start working". A day has hundreds of ' +
        'windows: narrow it to hours with `fromTime` / `toTime`; when more than `limit` (80 ' +
        'by default) are left, only the longest are returned and `note` says so.',
      parameters: {
        type: 'object',
        properties: {
          day: { type: 'string', description: 'The day, YYYY-MM-DD' },
          fromTime: { type: 'string', description: 'HH:mm — only what was open from this time' },
          toTime: { type: 'string', description: 'HH:mm — only what was open up to this time' },
          limit: { type: 'number', description: '1–200, default 80' },
        },
        required: ['day'],
      },
      handler: async (userId, args) => {
        const { fromTime, toTime, limit, ...day } = timelineArgs.parse(args);
        return digestTimeline(
          await this.activity.timeline(userId, day),
          this.users.timeZoneOf(await this.users.findById(userId)),
          { fromTime, toTime, limit },
        );
      },
    });
  }
}
