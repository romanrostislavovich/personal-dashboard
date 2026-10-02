import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { contains, DB, Database, SEARCH_LIMIT, SearchService } from '@pd/api-core';
import { SearchHit } from '@pd/contracts';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { scrobbles } from './music.schema';
import { soundcloudTracks } from './soundcloud/soundcloud.schema';

/** Music for the command palette: artists and tracks of the listening history, the user's own SoundCloud tracks. */
@Injectable()
export class MusicSearch implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly search: SearchService,
  ) {}

  onModuleInit(): void {
    this.search.register({ module: 'music', search: (userId, query) => this.find(userId, query) });
  }

  private async find(userId: string, query: string): Promise<SearchHit[]> {
    const plays = sql<number>`count(*)::int`;
    const listened = await this.db
      .select({ artist: scrobbles.artist, track: scrobbles.track, plays })
      .from(scrobbles)
      .where(
        and(
          eq(scrobbles.userId, userId),
          or(contains(scrobbles.artist, query), contains(scrobbles.track, query)),
        ),
      )
      .groupBy(scrobbles.artist, scrobbles.track)
      .orderBy(desc(plays))
      .limit(SEARCH_LIMIT);
    const own = await this.db
      .select()
      .from(soundcloudTracks)
      .where(and(eq(soundcloudTracks.userId, userId), contains(soundcloudTracks.title, query)))
      .orderBy(desc(soundcloudTracks.plays))
      .limit(SEARCH_LIMIT);
    return [
      ...listened.map((row) => ({
        module: 'music',
        kind: 'track',
        title: `${row.artist} — ${row.track}`,
        subtitle: `× ${row.plays}`,
        url: '/music/listening',
      })),
      ...own.map((row) => ({
        module: 'music',
        kind: 'soundcloud',
        title: row.title,
        subtitle: `SoundCloud · ▶ ${row.plays}`,
        url: '/music/soundcloud',
      })),
    ];
  }
}
