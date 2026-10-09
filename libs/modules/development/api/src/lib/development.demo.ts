import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, DemoService } from '@pd/api-core';
import { repoDailyStats, trackedRepos } from './open-source/open-source.schema';
import { wakatimeDayBreakdown, wakatimeDays, wakatimeSettings } from './wakatime/wakatime.schema';

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 30;
const CODING_DAYS = 45;

/** Name, language, stars, stars a week, issues, pull requests, npm downloads, private. */
const REPOS: [string, string, number, number, number, number, number | null, boolean][] = [
  ['alex/tiny-router', 'TypeScript', 1284, 31, 7, 1, 18400, false],
  ['alex/tea-shop', 'TypeScript', 412, 9, 3, 2, null, true],
  ['alex/dotfiles', 'Shell', 57, 1, 0, 0, null, false],
  ['alex/blog', 'Astro', 12, 0, 1, 0, null, false],
];

/**
 * The demo data of Development: repositories with a month of stars, and coding time by
 * project, language and editor. Nothing is connected: the syncs do not run on a demo.
 */
@Injectable()
export class DevelopmentDemo implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly demo: DemoService,
  ) {}

  onModuleInit(): void {
    this.demo.register({
      module: 'development',
      seed: async ({ userId, daysAgo }) => {
        for (const [fullName, language, stars, growth, issues, pulls, npm, isPrivate] of REPOS) {
          const forks = Math.round(stars / 9);
          const [repo] = await this.db
            .insert(trackedRepos)
            .values({
              userId,
              provider: 'github',
              relation: 'owner',
              fullName,
              htmlUrl: `https://github.com/${fullName}`,
              language,
              isPrivate,
              stars,
              forks,
              openIssues: issues,
              openPulls: pulls,
              npmWeeklyDownloads: npm,
              npmPackage: npm ? fullName.split('/')[1] : null,
              pushedAt: new Date(Date.now() - DAY_MS),
              lastSyncedAt: new Date(),
            })
            .returning();
          await this.db.insert(repoDailyStats).values(
            Array.from({ length: HISTORY_DAYS + 1 }, (_, days) => ({
              repoId: repo.id,
              day: daysAgo(days),
              stars: stars - Math.round((days * growth) / 7),
              forks,
              openIssues: issues,
              openPulls: pulls,
              npmWeeklyDownloads: npm,
            })),
          );
        }

        await this.db
          .insert(wakatimeSettings)
          .values({ userId, username: 'alex', lastSyncedAt: new Date() });
        const days = Array.from({ length: CODING_DAYS }, (_, index) => ({
          day: daysAgo(index),
          // Less on every sixth and seventh day: a weekend of a kind.
          seconds: index % 7 >= 5 ? 2400 : 12600 + ((index * 1700) % 6000),
        }));
        await this.db
          .insert(wakatimeDays)
          .values(days.map(({ day, seconds }) => ({ userId, day, totalSeconds: seconds })));
        const part = (
          kind: 'project' | 'language' | 'editor' | 'machine',
          shares: [string, number][],
        ) =>
          days.flatMap(({ day, seconds }) =>
            shares.map(([name, share]) => ({
              userId,
              day,
              kind,
              name,
              seconds: Math.round(seconds * share),
            })),
          );
        await this.db.insert(wakatimeDayBreakdown).values([
          ...part('project', [
            ['tea-shop', 0.6],
            ['tiny-router', 0.3],
            ['blog', 0.1],
          ]),
          ...part('language', [
            ['TypeScript', 0.7],
            ['SCSS', 0.15],
            ['Markdown', 0.15],
          ]),
          ...part('editor', [['VS Code', 1]]),
          ...part('machine', [['Laptop', 1]]),
        ]);
      },
    });
  }
}
