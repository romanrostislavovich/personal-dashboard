import { Injectable, OnModuleInit } from '@nestjs/common';
import { MorningDigestService } from '@pd/api-core';
import { addDays, toLocalDate } from '@pd/contracts';
import { toHours } from './coding-stats';
import { WakatimeService } from './wakatime.service';

/** Coding time in the morning digest: how yesterday went. */
@Injectable()
export class WakatimeDigest implements OnModuleInit {
  constructor(
    private readonly digest: MorningDigestService,
    private readonly wakatime: WakatimeService,
  ) {}

  onModuleInit(): void {
    this.digest.register({
      id: 'development.coding-time',
      module: 'development',
      description:
        'Coding time of yesterday from WakaTime: `hours`, the main `project` and `language`. ' +
        'Tell it in one line.',
      // A finished day does not change any more, so it is told once — the morning after.
      collect: async (userId) => {
        const yesterday = toLocalDate(addDays(this.wakatime.today(), -1));
        const [day] = await this.wakatime.days(userId, yesterday, yesterday);
        if (!day || day.seconds === 0) {
          return null;
        }
        const top = async (kind: 'project' | 'language') =>
          (await this.wakatime.shares(userId, kind, yesterday, yesterday, 1))[0]?.name ?? null;
        return {
          day: yesterday,
          hours: toHours(day.seconds),
          project: await top('project'),
          language: await top('language'),
        };
      },
    });
  }
}
