import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, LinksService, Period, UsersService } from '@pd/api-core';
import { addDays, LocalDate, parseLocalDate, toLocalDate, zonedToUtc } from '@pd/contracts';
import { and, asc, eq, gte, lt, sql } from 'drizzle-orm';
import { scrobbles } from './music.schema';

/** A payment named with one of these is for listening to music (the plays come from Last.fm). */
const STREAMING = ['spotify', 'apple music', 'youtube music', 'deezer', 'tidal', 'last.fm'];
/** Plays told about a stretch of time: a focus session has a few dozen at most. */
const MAX_MOMENTS = 300;

/**
 * What music tells the other sections (see LinksService): what played at a moment (during a
 * focus session), whether a streaming service that is paid for is listened to, and the plays
 * of every day.
 */
@Injectable()
export class MusicLinks implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.links.registerMoments({
      module: 'music',
      between: async (userId, from, to) => {
        const plays = await this.db
          .select()
          .from(scrobbles)
          .where(
            and(
              eq(scrobbles.userId, userId),
              gte(scrobbles.playedAt, from),
              lt(scrobbles.playedAt, to),
            ),
          )
          .orderBy(asc(scrobbles.playedAt))
          .limit(MAX_MOMENTS);
        return plays.map((play) => ({
          module: 'music',
          kind: 'play',
          at: play.playedAt.toISOString(),
          title: play.track,
          subtitle: play.artist,
        }));
      },
    });

    this.links.registerUsage({
      module: 'music',
      usage: async (userId, name, period) => {
        if (!STREAMING.some((service) => name.includes(service))) {
          return null;
        }
        const [row] = await this.db
          .select({
            plays: sql<number>`count(*)::int`,
            last: sql<Date | null>`max(${scrobbles.playedAt})`,
          })
          .from(scrobbles)
          .where(await this.within(userId, period));
        return {
          unitKey: 'music.usage.plays',
          amount: row?.plays ?? 0,
          lastUsedAt: row?.last ? new Date(row.last).toISOString() : null,
        };
      },
    });

    this.links.registerDailyMetrics({
      module: 'music',
      metrics: async (userId, period) => {
        const timeZone = await this.timeZone(userId);
        const day = sql<LocalDate>`to_char(${scrobbles.playedAt} AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`;
        const days = await this.db
          .select({ day, plays: sql<number>`count(*)::int` })
          .from(scrobbles)
          .where(await this.within(userId, period))
          // By position: the time zone is a parameter (see ActivityService.stats).
          .groupBy(sql`1`);
        return days.length
          ? [
              {
                key: 'music.plays',
                module: 'music',
                labelKey: 'music.links.plays',
                unit: 'count',
                days: days.map(({ day: date, plays }) => ({ day: date, value: plays })),
              },
            ]
          : [];
      },
    });

    this.links.registerPages([
      { module: 'music', path: '/music/listening', description: 'listening history and tops' },
    ]);
  }

  /** The plays of the user's own days of a period. */
  private async within(userId: string, period: Period) {
    const timeZone = await this.timeZone(userId);
    const after = toLocalDate(addDays(parseLocalDate(period.to), 1));
    return and(
      eq(scrobbles.userId, userId),
      gte(scrobbles.playedAt, zonedToUtc({ date: period.from, time: '00:00' }, timeZone)),
      lt(scrobbles.playedAt, zonedToUtc({ date: after, time: '00:00' }, timeZone)),
    );
  }

  private async timeZone(userId: string): Promise<string> {
    return this.users.timeZoneOf(await this.users.findById(userId));
  }
}
