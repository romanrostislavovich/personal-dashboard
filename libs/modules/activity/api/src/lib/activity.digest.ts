import { Injectable, OnModuleInit } from '@nestjs/common';
import { MorningDigestService } from '@pd/api-core';
import { addDays, parseLocalDate, toLocalDate } from '@pd/contracts';
import { ActivityService } from './activity.service';
import { WellbeingService } from './wellbeing.service';

const HOUR = 3600;
const hours = (seconds: number) => Math.round((seconds / HOUR) * 10) / 10;

/** Yesterday at the computer, with its focus sessions, in the morning digest. */
@Injectable()
export class ActivityDigest implements OnModuleInit {
  constructor(
    private readonly digest: MorningDigestService,
    private readonly activity: ActivityService,
    private readonly wellbeing: WellbeingService,
  ) {}

  onModuleInit(): void {
    this.digest.register({
      id: 'activity.yesterday',
      module: 'activity',
      description:
        'Yesterday at the computer: `hours` in total, the top `categories` and `apps` with ' +
        'their hours, time on `projects`, and `focus` sessions (Pomodoro) when there were any: ' +
        'how many, their `hours`, the `streak` of days in a row. Say in a line how the day went: ' +
        'how long, on what; praise a focus streak.',
      collect: async (userId) => {
        const yesterday = toLocalDate(
          addDays(parseLocalDate(await this.activity.today(userId)), -1),
        );
        const stats = await this.activity.stats(userId, { from: yesterday, to: yesterday });
        if (stats.totalSeconds < 60) {
          return null; // The computer was off, or no tracker is installed.
        }
        const top = <T extends { seconds: number }>(list: T[], name: (item: T) => string) =>
          list.slice(0, 3).map((item) => ({ name: name(item), hours: hours(item.seconds) }));
        return {
          day: yesterday,
          hours: hours(stats.totalSeconds),
          categories: top(stats.categories, (c) => c.category),
          apps: top(stats.apps, (a) => a.name),
          projects: top(stats.projects, (p) => p.name),
          focus: await this.focus(userId, yesterday),
        };
      },
    });
  }

  private async focus(userId: string, day: string) {
    const focus = await this.wellbeing.focusStats(userId, { from: day, to: day });
    return focus.sessions.length
      ? {
          sessions: focus.completed,
          hours: hours(focus.focusSeconds),
          streak: focus.streak.current,
        }
      : null;
  }
}
