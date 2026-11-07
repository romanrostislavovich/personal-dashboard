import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {
  DB,
  Database,
  daysOf,
  LinksService,
  MOOD_METRIC,
  Period,
  UsersService,
} from '@pd/api-core';
import {
  addDays,
  LocalDate,
  parseLocalDate,
  toLocalDate,
  zonedToUtc,
} from '@pd/contracts';
import {and, asc, eq, gte, lt, sql} from 'drizzle-orm';
import {moodArtists, MoodArtists} from './mood-artists';
import {genreKey} from './music-genres';
import {MusicGenresService} from './music-genres.service';
import {scrobbles} from './music.schema';

/** A payment named with one of these is for listening to music (the plays come from Last.fm). */
const STREAMING = [
  'spotify',
  'apple music',
  'youtube music',
  'deezer',
  'tidal',
  'last.fm',
];
/** Genres of a period that get a number of their own in Links. */
const LINKED_GENRES = 5;
/** A play after this long without one starts listening again (an event of the hour). */
const LISTENING_GAP_MS = 60 * 60_000;
/** Plays told about a stretch of time: a focus session has a few dozen at most. */
const MAX_MOMENTS = 300;

/**
 * What music tells the other sections (see LinksService): what played at a moment (during a
 * focus session), whether a streaming service that is paid for is listened to, and the plays
 * of every day — all of them and of the period's main genres.
 */
@Injectable()
export class MusicLinks implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
    private readonly users: UsersService,
    private readonly genres: MusicGenresService,
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
        return plays.map(play => ({
          module: 'music',
          kind: 'play',
          at: play.playedAt.toISOString(),
          title: play.track,
          subtitle: play.artist,
        }));
      },
    });

    // Hour by hour: the plays, and the hours music starts after an hour or more of quiet.
    this.links.registerHourly({
      module: 'music',
      hours: async (userId, period, timeZone) => {
        const after = toLocalDate(addDays(parseLocalDate(period.to), 1));
        const plays = await this.db
          .select({
            at: scrobbles.playedAt,
            hour: sql<string>`to_char(${scrobbles.playedAt} AT TIME ZONE ${timeZone}, 'YYYY-MM-DD"T"HH24')`,
          })
          .from(scrobbles)
          .where(
            and(
              eq(scrobbles.userId, userId),
              gte(
                scrobbles.playedAt,
                zonedToUtc({date: period.from, time: '00:00'}, timeZone),
              ),
              lt(
                scrobbles.playedAt,
                zonedToUtc({date: after, time: '00:00'}, timeZone),
              ),
            ),
          )
          .orderBy(asc(scrobbles.playedAt));
        if (!plays.length) {
          return {metrics: [], events: []};
        }
        const counts = new Map<string, number>();
        const starts = new Set<string>();
        plays.forEach((play, index) => {
          counts.set(play.hour, (counts.get(play.hour) ?? 0) + 1);
          const before = plays[index - 1];
          if (
            !before ||
            play.at.getTime() - before.at.getTime() >= LISTENING_GAP_MS
          ) {
            starts.add(play.hour);
          }
        });
        // From the first play to the last: before it the plays were not counted yet.
        const first = plays[0].hour.slice(0, 10);
        const last = plays[plays.length - 1].hour.slice(0, 10);
        const days = daysOf(period).filter(day => day >= first && day <= last);
        return {
          metrics: [
            {
              key: 'music.hour.plays',
              module: 'music',
              labelKey: 'music.links.plays',
              unit: 'count',
              days,
              hours: [...counts].map(([hour, value]) => ({hour, value})),
            },
          ],
          events: [
            {
              key: 'music.event.listening',
              module: 'music',
              labelKey: 'music.links.listening',
              days,
              hours: [...starts],
              itself: ['music.hour.plays'],
            },
          ],
        };
      },
    });

    this.links.registerUsage({
      module: 'music',
      usage: async (userId, name, period) => {
        if (!STREAMING.some(service => name.includes(service))) {
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
          .select({day, plays: sql<number>`count(*)::int`})
          .from(scrobbles)
          .where(await this.within(userId, period))
          // By position: the time zone is a parameter (see ActivityService.stats).
          .groupBy(sql`1`);
        if (!days.length) {
          return [];
        }
        const after = toLocalDate(addDays(parseLocalDate(period.to), 1));
        const genres = await this.genres.daily(
          userId,
          zonedToUtc({date: period.from, time: '00:00'}, timeZone),
          zonedToUtc({date: after, time: '00:00'}, timeZone),
          timeZone,
          LINKED_GENRES,
        );
        return [
          {
            key: 'music.plays',
            module: 'music',
            labelKey: 'music.links.plays',
            unit: 'count' as const,
            days: days.map(({day: date, plays}) => ({
              day: date,
              value: plays,
            })),
          },
          ...genres.map(genre => ({
            key: genreKey(genre.genre),
            module: 'music',
            labelKey: 'music.links.genre',
            label: genre.genre,
            unit: 'count' as const,
            partOf: 'music.plays',
            days: genre.days,
          })),
        ];
      },
    });

    this.links.registerPages([
      {
        module: 'music',
        path: '/music/listening',
        description: 'listening history and tops',
      },
    ]);
  }

  /**
   * Who plays on the days of a good mood and who on the bad ones. The mood is the diary's:
   * the core tells it day by day.
   */
  async moodArtists(userId: string, period: Period): Promise<MoodArtists> {
    const mood = await this.links.dailyMetric(userId, MOOD_METRIC, period);
    const timeZone = await this.timeZone(userId);
    const day = sql<LocalDate>`to_char(${scrobbles.playedAt} AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`;
    const plays = mood?.days.length
      ? await this.db
          .select({
            day,
            artist: scrobbles.artist,
            plays: sql<number>`count(*)::int`,
          })
          .from(scrobbles)
          .where(await this.within(userId, period))
          .groupBy(sql`1`, scrobbles.artist)
      : [];
    return moodArtists(mood?.days ?? [], plays);
  }

  /** The plays of the user's own days of a period. */
  private async within(userId: string, period: Period) {
    const timeZone = await this.timeZone(userId);
    const after = toLocalDate(addDays(parseLocalDate(period.to), 1));
    return and(
      eq(scrobbles.userId, userId),
      gte(
        scrobbles.playedAt,
        zonedToUtc({date: period.from, time: '00:00'}, timeZone),
      ),
      lt(
        scrobbles.playedAt,
        zonedToUtc({date: after, time: '00:00'}, timeZone),
      ),
    );
  }

  private async timeZone(userId: string): Promise<string> {
    return this.users.timeZoneOf(await this.users.findById(userId));
  }
}
