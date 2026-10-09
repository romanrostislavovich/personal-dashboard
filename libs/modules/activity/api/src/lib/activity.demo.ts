import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, DemoService } from '@pd/api-core';
import { randomUUID } from 'node:crypto';
import {
  activityApps,
  activityDevices,
  activityFocusSessions,
  activityLimits,
  activitySettings,
  activitySpans,
} from './activity.schema';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const DAYS = 40;
/** Program, its name, a window title, minutes on an ordinary day. */
const DAY_OF_WORK: [string, string, string, number][] = [
  ['code.exe', 'Visual Studio Code', 'tea-shop — checkout.ts', 170],
  ['chrome.exe', 'Chrome', 'Pull request · alex/tea-shop', 75],
  ['figma.exe', 'Figma', 'Tea Shop — landing', 40],
  ['slack.exe', 'Slack', 'Slack', 30],
  ['spotify.exe', 'Spotify', 'Spotify', 10],
];

/**
 * The demo data of Activity: forty days at a laptop, focus sessions, a limit of games. No
 * tracker reports here: the data stands as it was made.
 */
@Injectable()
export class ActivityDemo implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly demo: DemoService,
  ) {}

  onModuleInit(): void {
    this.demo.register({
      module: 'activity',
      seed: async ({ userId, projects }) => {
        const now = Date.now();
        const [device] = await this.db
          .insert(activityDevices)
          .values({
            userId,
            name: 'Laptop',
            platform: 'windows',
            // Nothing can report with it: no token has this hash.
            tokenHash: `demo-${randomUUID()}`,
            lastSeenAt: new Date(now),
          })
          .returning();
        await this.db.insert(activitySettings).values({ userId, gamesMinutesPerTask: 15 });
        await this.db.insert(activityApps).values({ userId, app: 'hades.exe', category: 'games' });
        await this.db.insert(activityLimits).values({ userId, kind: 'games', minutes: 90 });

        const spans = [];
        for (let day = 0; day < DAYS; day++) {
          // The day starts at eight in the morning of the server; an evening of games on some.
          const start = now - day * DAY_MS - (day === 0 ? 5 * HOUR_MS : 9 * HOUR_MS);
          const programs: [string, string, string, number][] = [
            ...DAY_OF_WORK,
            ...(day % 3 === 1
              ? [['hades.exe', 'Hades', 'Hades', 80] as [string, string, string, number]]
              : []),
          ];
          let at = start;
          for (const [app, appName, title, minutes] of programs) {
            // A weekend of a kind on every sixth and seventh day; today is only half over.
            const share = day === 0 ? 0.55 : day % 7 >= 5 ? 0.3 : 1 - ((day * 7) % 20) / 100;
            const seconds = Math.round(minutes * 60 * share);
            spans.push({
              userId,
              deviceId: device.id,
              app,
              appName,
              title,
              startedAt: new Date(at),
              endedAt: new Date(at + seconds * 1000),
              seconds,
            });
            at += seconds * 1000 + MINUTE_MS;
          }
        }
        await this.db.insert(activitySpans).values(spans);

        const session = (hoursAgo: number, note: string, completed = true) => ({
          id: randomUUID(),
          userId,
          deviceId: device.id,
          projectId: projects.shop,
          note,
          startedAt: new Date(now - hoursAgo * HOUR_MS),
          endedAt: new Date(now - hoursAgo * HOUR_MS + 25 * MINUTE_MS),
          plannedMinutes: 25,
          focusSeconds: completed ? 1500 : 700,
          completed,
          distractions: completed ? [] : [{ app: 'chrome.exe', name: 'Chrome', seconds: 240 }],
        });
        await this.db
          .insert(activityFocusSessions)
          .values([
            session(4, 'Fix checkout rounding'),
            session(3, 'Fix checkout rounding'),
            session(2, 'Reply to the customer'),
            session(27, 'Write the release notes'),
            session(28, 'Landing page', false),
            session(51, 'Fix checkout rounding'),
          ]);
      },
    });
  }
}
