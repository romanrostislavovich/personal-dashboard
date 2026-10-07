import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS, PERIOD_PARAMETERS, UsersService } from '@pd/api-core';
import {
  activityDaySchema,
  activityPeriodSchema,
  activitySettingsUpdateSchema,
} from '@pd/contracts';
import { z } from 'zod';
import { ActivityLinks } from './activity.links';
import { ActivityService } from './activity.service';
import { digestTimeline } from './timeline-digest';
import { WellbeingService } from './wellbeing.service';

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
    private readonly wellbeing: WellbeingService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'activity_limits',
      module: 'activity',
      description:
        'The daily limits of time at the computer: `limits` — kind (games, total — the whole ' +
        'day, app — one program) and minutes; `gamesBonus` — how the limit of games grows ' +
        'with the tasks done today: minutesPerTask (0 — it does not), tasksDone, minutes ' +
        'earned so far. Useful for "how long may I still play today" together with ' +
        'activity_stats of today.',
      parameters: NO_PARAMETERS,
      handler: async (userId) => ({
        limits: await this.wellbeing.limits(userId),
        gamesBonus: await this.wellbeing.gamesBonus(userId, await this.activity.today(userId)),
      }),
    });

    this.ai.registerTool({
      name: 'activity_set_games_bonus',
      module: 'activity',
      writes: true,
      description:
        'Sets how many minutes every task done today adds to the daily limit of games ' +
        '(0–120; 0 — the limit no longer depends on the tasks). The limit itself is set in ' +
        'the settings of Activity.',
      parameters: {
        type: 'object',
        properties: { minutes: { type: 'number', description: '0–120 per task' } },
        required: ['minutes'],
      },
      handler: async (userId, args) => {
        const { gamesMinutesPerTask } = activitySettingsUpdateSchema.parse({
          gamesMinutesPerTask: args['minutes'],
        });
        await this.activity.saveSettings(userId, { gamesMinutesPerTask });
        return { gamesMinutesPerTask };
      },
    });

    this.ai.registerTool({
      name: 'activity_focus_music',
      module: 'activity',
      description:
        'Focus sessions (Pomodoro) of a period against the music that played during them ' +
        '(from the listening history): `withMusic` and `withoutMusic` — sessions, focus ' +
        'seconds, percent finished, percent of the time lost to distractions; `artists` — who ' +
        'played in the most sessions; `byProject` — who played while working on each project. Useful for "what do I listen to when I work", "do I ' +
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
