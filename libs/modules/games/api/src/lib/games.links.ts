import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {
  DB,
  Database,
  LinksService,
  OtherComputersService,
  UsersService,
} from '@pd/api-core';
import {DailyMetric, LocalDate} from '@pd/contracts';
import {and, eq, sql} from 'drizzle-orm';
import {dotaMatches, gameAccounts} from './games.schema';
import {SteamPlayService} from './steam/steam-play.service';

/** A name shorter than this would be found inside any other word. */
const MIN_NAME = 4;

/**
 * What games tell the other sections (see LinksService): the play time of Steam for the time
 * at the computer — also on a console or a computer without the tracker —, whether a game
 * that is paid for is played, the hours of Steam and the matches of Dota 2 of every day (how
 * many, how many won, how many late at night).
 */
@Injectable()
export class GamesLinks implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
    private readonly computers: OtherComputersService,
    private readonly play: SteamPlayService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.links.registerDailyMetrics({
      module: 'games',
      metrics: async (userId, period) => [
        ...(await this.dotaDays(userId, period)),
        ...(await this.steamDays(userId, period)),
      ],
    });

    this.computers.register({
      id: 'steam',
      module: 'games',
      days: async (userId, from, to) => {
        const perDay = new Map<string, number>();
        for (const {day, minutes} of await this.play.days(userId, from, to)) {
          perDay.set(day, (perDay.get(day) ?? 0) + minutes);
        }
        return [...perDay].map(([day, minutes]) => ({
          computer: 'Steam',
          day,
          seconds: minutes * 60,
          category: 'games' as const,
        }));
      },
    });

    this.links.registerUsage({
      module: 'games',
      usage: async (userId, name, period) => {
        const days = await this.play.days(userId, period.from, period.to);
        const all = name.includes('steam');
        const played = days.filter(day => {
          const game = day.name.toLowerCase();
          return (
            all ||
            (game.length >= MIN_NAME &&
              (name.includes(game) || game.includes(name)))
          );
        });
        // Not played is an answer only for Steam itself: any other name may be no game at all.
        if (!played.length && !all) {
          return null;
        }
        return {
          unitKey: 'games.usage.minutes',
          amount: played.reduce((sum, day) => sum + day.minutes, 0),
          lastUsedAt: played[0]?.day ?? null,
        };
      },
    });

    this.links.registerPages([
      {
        module: 'games',
        path: '/games',
        description: 'Steam, Dota 2 and WoW accounts',
      },
    ]);
  }

  /** The hours of Steam of every day, on any computer or console. */
  private async steamDays(
    userId: string,
    period: {from: LocalDate; to: LocalDate},
  ): Promise<DailyMetric[]> {
    const perDay = new Map<LocalDate, number>();
    for (const {day, minutes} of await this.play.days(
      userId,
      period.from,
      period.to,
    )) {
      perDay.set(day, (perDay.get(day) ?? 0) + minutes);
    }
    return perDay.size
      ? [
          {
            key: 'games.steam',
            module: 'games',
            labelKey: 'games.links.steam',
            unit: 'hours',
            days: [...perDay].map(([day, minutes]) => ({
              day,
              value: minutes / 60,
            })),
          },
        ]
      : [];
  }

  /**
   * The matches of every day; a match from midnight to four is of the evening before, and
   * "late" is one started from 23:00.
   */
  private async dotaDays(
    userId: string,
    period: {from: LocalDate; to: LocalDate},
  ): Promise<DailyMetric[]> {
    const timeZone = this.users.timeZoneOf(await this.users.findById(userId));
    const m = dotaMatches;
    const local = sql`(${m.startedAt} AT TIME ZONE ${timeZone})`;
    const day = sql<LocalDate>`to_char(${local} - interval '4 hours', 'YYYY-MM-DD')`;
    const rows = await this.db
      .select({
        day,
        matches: sql<number>`count(*)::int`,
        late: sql<number>`count(*) filter (where extract(hour from ${local}) >= 23 or extract(hour from ${local}) < 4)::int`,
        known: sql<number>`count(${m.won})::int`,
        won: sql<number>`count(*) filter (where ${m.won})::int`,
      })
      .from(m)
      .innerJoin(gameAccounts, eq(gameAccounts.id, m.accountId))
      .where(
        and(
          eq(gameAccounts.userId, userId),
          sql`${day} >= ${period.from}`,
          sql`${day} <= ${period.to}`,
        ),
      )
      // By position: the time zone is a parameter (see ActivityService.stats).
      .groupBy(sql`1`);
    if (!rows.length) {
      return [];
    }
    const metric = (
      key: string,
      unit: DailyMetric['unit'],
      days: DailyMetric['days'],
      partOf?: string,
    ): DailyMetric => ({
      key: `games.${key}`,
      module: 'games',
      labelKey: `games.links.${key}`,
      unit,
      ...(partOf ? {partOf} : {}),
      days,
    });
    return [
      metric(
        'dotaMatches',
        'count',
        rows.map(row => ({day: row.day, value: row.matches})),
      ),
      metric(
        'dotaLateMatches',
        'count',
        rows.map(row => ({day: row.day, value: row.late})),
        'games.dotaMatches',
      ),
      metric(
        'dotaWins',
        'percent',
        rows
          .filter(row => row.known > 0)
          .map(row => ({
            day: row.day,
            value: Math.round((row.won / row.known) * 100),
          })),
      ),
    ];
  }
}
