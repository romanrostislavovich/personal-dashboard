import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS, PERIOD_PARAMETERS, ServerActions } from '@pd/api-core';
import { WakatimeBreakdown, WakatimeShare } from '@pd/contracts';
import { z } from 'zod';
import { codingTotals, toHours } from './coding-stats';
import { WAKATIME_ACTIONS } from './wakatime.server-actions';
import { WakatimeService } from './wakatime.service';

const LOCAL_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const periodSchema = z.object({ from: LOCAL_DATE, to: LOCAL_DATE });

/** AI access to the coding time from WakaTime; refreshing it (assistant). */
@Injectable()
export class WakatimeAiTools implements OnModuleInit {
  constructor(
    private readonly actions: ServerActions,
    private readonly ai: AiService,
    private readonly wakatime: WakatimeService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'coding_time',
      module: 'development',
      description:
        'Time spent coding (from WakaTime) for a period, in hours: total, per day (days without ' +
        'coding are left out), the daily average over active days, the best day, and the time ' +
        'per project, language and editor. The history starts on the day WakaTime was connected.',
      parameters: PERIOD_PARAMETERS,
      handler: async (userId, args) => {
        const { from, to } = periodSchema.parse(args);
        const days = await this.wakatime.days(userId, from, to);
        const totals = codingTotals(days);
        const top = async (kind: WakatimeBreakdown) =>
          inHours(await this.wakatime.shares(userId, kind, from, to));
        return {
          totalHours: toHours(totals.totalSeconds),
          activeDays: totals.activeDays,
          dailyAverageHours: toHours(totals.dailyAverageSeconds),
          bestDay: totals.bestDay && {
            day: totals.bestDay.day,
            hours: toHours(totals.bestDay.seconds),
          },
          projects: await top('project'),
          languages: await top('language'),
          editors: await top('editor'),
          // Last: over a long period the days are many, and what is cut must not be the totals.
          days: days.map(({ day, seconds }) => ({ day, hours: toHours(seconds) })),
        };
      },
    });

    this.ai.registerTool({
      name: 'coding_time_sync',
      module: 'development',
      writes: true,
      description:
        'Loads the latest coding time from WakaTime now instead of waiting for the hourly sync.',
      parameters: NO_PARAMETERS,
      handler: async (userId) => {
        await this.actions.run(userId, WAKATIME_ACTIONS.sync);
        return { refreshed: true };
      },
    });
  }
}

function inHours(shares: WakatimeShare[]) {
  return shares.map(({ name, seconds }) => ({ name, hours: toHours(seconds) }));
}
