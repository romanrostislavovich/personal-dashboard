import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, LifeService, localDaysRange, UsersService } from '@pd/api-core';
import { LifeCard, LifeEvent } from '@pd/contracts';
import { and, count, desc, eq, gte, lt } from 'drizzle-orm';
import { scrobbles } from './music.schema';

/** What was listened to: the plays of a day and of a period, with the top artist. */
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
        const { plays, artist } = await this.listened(userId, { from: day, to: day });
        return plays
          ? [
              {
                module: 'music',
                icon: 'headphones',
                key: 'music.life.day',
                params: { plays, artist },
                at: null,
                link: '/music',
              },
            ]
          : [];
      },
      period: async (userId, period): Promise<LifeCard[]> => {
        const { plays, artist } = await this.listened(userId, period);
        return plays
          ? [
              {
                module: 'music',
                icon: 'headphones',
                key: 'music.life.plays',
                value: plays,
                format: 'number',
                detailKey: 'music.life.topArtist',
                detailParams: { artist },
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
    const [top] = await this.db
      .select({ artist: scrobbles.artist, plays: count() })
      .from(scrobbles)
      .where(where)
      .groupBy(scrobbles.artist)
      .orderBy(desc(count()))
      .limit(1);
    return { plays: total?.plays ?? 0, artist: top?.artist ?? '' };
  }
}
