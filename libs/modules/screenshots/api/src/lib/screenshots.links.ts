import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, LinksService, UsersService } from '@pd/api-core';
import { addDays, LocalDate, parseLocalDate, toLocalDate, zonedToUtc } from '@pd/contracts';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { screenshots } from './screenshots.schema';

/**
 * What Screenshots tells the other sections (see LinksService): how many screenshots were taken
 * on every day — for the links of Life, a trace of a day of work at the computer.
 */
@Injectable()
export class ScreenshotsLinks implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.links.registerDailyMetrics({
      module: 'screenshots',
      metrics: async (userId, period) => {
        const timeZone = this.users.timeZoneOf(await this.users.findById(userId));
        const after = toLocalDate(addDays(parseLocalDate(period.to), 1));
        const s = screenshots;
        const days = await this.db
          .select({
            day: sql<LocalDate>`to_char(${s.createdAt} AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`,
            count: sql<number>`count(*)::int`,
          })
          .from(s)
          .where(
            and(
              eq(s.userId, userId),
              gte(s.createdAt, zonedToUtc({ date: period.from, time: '00:00' }, timeZone)),
              lt(s.createdAt, zonedToUtc({ date: after, time: '00:00' }, timeZone)),
            ),
          )
          // By position: the time zone is a parameter (see ActivityService.stats).
          .groupBy(sql`1`);
        return days.length
          ? [
              {
                key: 'screenshots.taken',
                module: 'screenshots',
                labelKey: 'screenshots.links.taken',
                unit: 'count',
                days: days.map(({ day, count }) => ({ day, value: count })),
              },
            ]
          : [];
      },
    });
  }
}
