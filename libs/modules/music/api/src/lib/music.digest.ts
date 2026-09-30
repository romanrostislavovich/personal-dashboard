import { Injectable, OnModuleInit } from '@nestjs/common';
import { MorningDigestService } from '@pd/api-core';
import { LastfmService } from './lastfm.service';

/** Scrobble milestones are counted in these steps. */
const MILESTONE = 1000;

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
      description:
        `Last.fm: \`scrobbleMilestone\` — total scrobbles rounded down to ${MILESTONE}, ` +
        '`artistOfTheWeek` — the most played artist over 7 days. Congratulate on a new ' +
        'milestone, mention a new artist of the week.',
      // Plays grow every day by themselves, so only milestones and the top artist are compared.
      collect: async (userId) => {
        const total = await this.lastfm.totalScrobbles(userId);
        if (total === null) {
          return null; // Last.fm is not connected.
        }
        const tops = await this.lastfm.tops(userId, '7day');
        return {
          scrobbleMilestone: Math.floor(total / MILESTONE) * MILESTONE,
          artistOfTheWeek: tops?.artists[0]?.name ?? null,
        };
      },
    });
  }
}
