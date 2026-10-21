import { Injectable, OnModuleInit } from '@nestjs/common';
import { MorningDigestService } from '@pd/api-core';
import { MusicTopItem } from '@pd/contracts';
import { LastfmService } from './lastfm.service';

/** Scrobble milestones are counted in these steps. */
const MILESTONE = 1000;
/**
 * Fewer plays than this in a week is not an "artist of the week": a few songs an autoplay
 * slipped in (YouTube Music, a TV signed into Spotify) would be told as the week's music.
 */
export const ARTIST_OF_THE_WEEK_MIN_PLAYS = 5;

/** The most played artist of the week, when they were played enough to count. */
export function artistOfTheWeek(artists: MusicTopItem[] | undefined): string | null {
  const top = artists?.[0];
  return top && top.playcount >= ARTIST_OF_THE_WEEK_MIN_PLAYS ? top.name : null;
}

/** What the model is told about the music facts (the evals use it too). */
export const MUSIC_DIGEST_DESCRIPTION =
  `Last.fm: \`scrobbleMilestone\` — total scrobbles rounded down to ${MILESTONE}, ` +
  '`artistOfTheWeek` — the most played artist over 7 days (null — nobody stood out: ' +
  'then say nothing about an artist). Congratulate on a new milestone, mention a new ' +
  'artist of the week.';

/** Music in the morning digest: a new artist of the week and scrobble milestones. */
@Injectable()
export class MusicDigest implements OnModuleInit {
  constructor(
    private readonly digest: MorningDigestService,
    private readonly lastfm: LastfmService,
  ) {}

  onModuleInit(): void {
    this.digest.register({
      id: 'music.highlights',
      module: 'music',
      description: MUSIC_DIGEST_DESCRIPTION,
      // Plays grow every day by themselves, so only milestones and the top artist are compared.
      collect: async (userId) => {
        const total = await this.lastfm.totalScrobbles(userId);
        if (total === null) {
          return null; // Last.fm is not connected.
        }
        const tops = await this.lastfm.tops(userId, '7day');
        return {
          scrobbleMilestone: Math.floor(total / MILESTONE) * MILESTONE,
          artistOfTheWeek: artistOfTheWeek(tops?.artists),
        };
      },
    });
  }
}
