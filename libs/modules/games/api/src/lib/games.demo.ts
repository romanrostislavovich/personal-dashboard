import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, DemoService } from '@pd/api-core';
import { gameAccounts, steamGames, steamPlayDays } from './games.schema';

const DAY_MS = 24 * 60 * 60 * 1000;
/** App id, name, minutes in total, minutes in two weeks, days since played, achievements. */
const LIBRARY: [number, string, number, number, number, number, number][] = [
  [1145360, 'Hades', 5400, 320, 1, 38, 49],
  [413150, 'Stardew Valley', 9100, 0, 40, 29, 40],
  [367520, 'Hollow Knight', 3900, 110, 4, 41, 63],
  [504230, 'Celeste', 1300, 0, 120, 22, 32],
];

/**
 * The demo data of Games: a Steam library with play time, as a sync would leave it. Nothing
 * is connected: no account of anybody's is behind it.
 */
@Injectable()
export class GamesDemo implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly demo: DemoService,
  ) {}

  onModuleInit(): void {
    this.demo.register({
      module: 'games',
      seed: async ({ userId, daysAgo }) => {
        const [account] = await this.db
          .insert(gameAccounts)
          .values({
            userId,
            game: 'steam',
            externalId: '76561190000000000',
            displayName: 'alex',
            profile: {
              personaName: 'alex',
              avatarUrl: null,
              profileUrl: 'https://steamcommunity.com/',
              level: 24,
              createdAt: '2014-05-01T00:00:00.000Z',
              gamesHidden: false,
            },
            lastSyncedAt: new Date(),
          })
          .returning();
        await this.db.insert(steamGames).values(
          LIBRARY.map(([appId, name, minutes, recent, daysSince, unlocked, total]) => ({
            accountId: account.id,
            appId,
            name,
            playtimeMinutes: minutes,
            playtime2WeeksMinutes: recent,
            lastPlayedAt: new Date(Date.now() - daysSince * DAY_MS),
            achievementsUnlocked: unlocked,
            achievementsTotal: total,
            achievementsPlaytime: minutes,
          })),
        );
        // The evenings of the last weeks, day by day.
        await this.db.insert(steamPlayDays).values(
          [1, 4, 7, 10, 13].map((days, index) => ({
            userId,
            accountId: account.id,
            appId: index % 2 ? 367520 : 1145360,
            day: daysAgo(days),
            minutes: 60 + index * 15,
          })),
        );
      },
    });
  }
}
