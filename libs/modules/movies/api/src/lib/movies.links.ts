import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {DB, Database, LinksService, UsersService} from '@pd/api-core';
import {DailyMetric, LocalDate} from '@pd/contracts';
import {and, eq, inArray, sql} from 'drizzle-orm';
import {movieViews} from './movies.schema';

/**
 * What Movies tells Links: the hours of watching every day, the part of them late at night, the
 * part on YouTube and the like, and the episodes. A view counts once its title is known (a film,
 * an episode, a video) — a page not found yet may be anything. The night belongs to the evening
 * before, like Dota's matches: a film from 23:00 to 01:00 is one evening's.
 */
@Injectable()
export class MoviesLinks implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.links.registerDailyMetrics({
      module: 'movies',
      metrics: (userId, period) => this.metrics(userId, period),
    });
    this.links.registerPages([
      {
        module: 'movies',
        path: '/movies',
        description: 'films and shows watched, rated, and to watch',
      },
    ]);
  }

  private async metrics(
    userId: string,
    period: {from: LocalDate; to: LocalDate},
  ): Promise<DailyMetric[]> {
    const timeZone = this.users.timeZoneOf(await this.users.findById(userId));
    const v = movieViews;
    const local = sql`(${v.startedAt} AT TIME ZONE ${timeZone})`;
    const day = sql<LocalDate>`to_char(${local} - interval '4 hours', 'YYYY-MM-DD')`;
    const rows = await this.db
      .select({
        day,
        seconds: sql<number>`sum(${v.watchedSeconds})::int`,
        late: sql<number>`coalesce(sum(${v.watchedSeconds}) filter (where extract(hour from ${local}) >= 23 or extract(hour from ${local}) < 4), 0)::int`,
        video: sql<number>`coalesce(sum(${v.watchedSeconds}) filter (where ${v.kind} = 'video'), 0)::int`,
        episodes: sql<number>`count(distinct (${v.titleId}, ${v.season}, ${v.episode})) filter (where ${v.kind} = 'episode')::int`,
      })
      .from(v)
      .where(
        and(
          eq(v.userId, userId),
          eq(v.dismissed, false),
          inArray(v.kind, ['movie', 'episode', 'video']),
          sql`${day} >= ${period.from}`,
          sql`${day} <= ${period.to}`,
        ),
      )
      // By position: the time zone is a parameter (see ActivityService.stats).
      .groupBy(sql`1`);
    if (!rows.length) {
      return [];
    }
    const hours = (seconds: number) => Math.round((seconds / 3600) * 100) / 100;
    const metric = (
      key: string,
      unit: DailyMetric['unit'],
      value: (row: (typeof rows)[number]) => number,
      partOf?: string,
    ): DailyMetric => ({
      key: `movies.${key}`,
      module: 'movies',
      labelKey: `movies.links.${key}`,
      unit,
      ...(partOf ? {partOf} : {}),
      days: rows.map(row => ({day: row.day, value: value(row)})),
    });
    return [
      metric('hours', 'hours', row => hours(row.seconds)),
      metric('lateHours', 'hours', row => hours(row.late), 'movies.hours'),
      metric('videoHours', 'hours', row => hours(row.video), 'movies.hours'),
      metric('episodes', 'count', row => row.episodes),
    ];
  }
}
