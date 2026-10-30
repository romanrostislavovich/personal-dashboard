import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {
  addDays,
  LocalDate,
  parseLocalDate,
  toLocalDate,
  zonedToUtc,
} from '@pd/contracts';
import {and, eq, gte, lt, sql} from 'drizzle-orm';
import {DB, Database} from '../database/database.module';
import {LinksService} from '../links/links.service';
import {UsersService} from '../users/users.service';
import {aiMessages} from './ai.schema';

/**
 * What the assistant tells the links of Life (see LinksService): how many messages the user
 * wrote to it on every day — the page, Telegram, the side panel of the browser alike.
 */
@Injectable()
export class AiLinks implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.links.registerDailyMetrics({
      module: 'ai',
      metrics: async (userId, period) => {
        const timeZone = this.users.timeZoneOf(
          await this.users.findById(userId),
        );
        const after = toLocalDate(addDays(parseLocalDate(period.to), 1));
        const m = aiMessages;
        const days = await this.db
          .select({
            day: sql<LocalDate>`to_char(${m.createdAt} AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`,
            count: sql<number>`count(*)::int`,
          })
          .from(m)
          .where(
            and(
              eq(m.userId, userId),
              eq(m.role, 'user'),
              gte(
                m.createdAt,
                zonedToUtc({date: period.from, time: '00:00'}, timeZone),
              ),
              lt(
                m.createdAt,
                zonedToUtc({date: after, time: '00:00'}, timeZone),
              ),
            ),
          )
          // By position: the time zone is a parameter (see ActivityService.stats).
          .groupBy(sql`1`);
        return days.length
          ? [
              {
                key: 'ai.messages',
                module: 'ai',
                labelKey: 'ai.links.messages',
                unit: 'count',
                days: days.map(({day, count}) => ({day, value: count})),
              },
            ]
          : [];
      },
    });
  }
}
