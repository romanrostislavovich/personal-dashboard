import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, LifeService, localDaysRange, UsersService } from '@pd/api-core';
import { LifeCard, LifeEvent } from '@pd/contracts';
import { and, asc, count, desc, eq, gte, lt } from 'drizzle-orm';
import { scrobbles } from './music.schema';

/** Leaders sharing the first place are all shown, up to this many. */
const TOP_ARTISTS = 3;

/** What was listened to: the plays of a day and of a period, with the top artists. */
@Injectable()
export class MusicLife implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly life: LifeService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.life.register({
      module: 'music',
      day: async (userId, day): Promise<LifeEvent[]> => {
        const { plays, artist, topPlays } = await this.listened(userId, { from: day, to: day });
        return plays
          ? [
              {
                module: 'music',
                icon: 'headphones',
                key: 'music.life.day',
                params: { plays, artist, topPlays },
                at: null,
                link: '/music',
              },
            ]
          : [];
      },
      period: async (userId, period): Promise<LifeCard[]> => {
        const { plays, artist, topPlays } = await this.listened(userId, period);
        return plays
          ? [
              {
                module: 'music',
                icon: 'headphones',
                key: 'music.life.plays',
                value: plays,
                format: 'number',
                detailKey: 'music.life.topArtist',
                detailParams: { artist, topPlays },
              },
            ]
          : [];
      },
    });
  }

  private async listened(userId: string, period: { from: string; to: string }) {
    const { start, end } = localDaysRange(
      this.users.timeZoneOf(await this.users.findById(userId)),
      period,
    );
    const where = and(
      eq(scrobbles.userId, userId),
      gte(scrobbles.playedAt, start),
      lt(scrobbles.playedAt, end),
    );
    const [total] = await this.db.select({ plays: count() }).from(scrobbles).where(where);
    const top = await this.db
      .select({ artist: scrobbles.artist, plays: count() })
      .from(scrobbles)
      .where(where)
      .groupBy(scrobbles.artist)
      .orderBy(desc(count()), asc(scrobbles.artist))
      .limit(TOP_ARTISTS);
    // A tie is common on a varied day: picking one of the leaders would be arbitrary.
    const topPlays = top[0]?.plays ?? 0;
    const leaders = top.filter((row) => row.plays === topPlays).map((row) => row.artist);
    return { plays: total?.plays ?? 0, artist: leaders.join(', '), topPlays };
  }
}
