import { Injectable, OnModuleInit } from '@nestjs/common';
import { MorningDigestService } from '@pd/api-core';
import { SoundcloudService } from './soundcloud.service';

/** Play milestones are counted in these steps. */
const MILESTONE = 1000;

/** SoundCloud in the morning digest: followers, new tracks and play milestones. */
@Injectable()
export class SoundcloudDigest implements OnModuleInit {
  constructor(
    private readonly digest: MorningDigestService,
    private readonly soundcloud: SoundcloudService,
  ) {}

  onModuleInit(): void {
    this.digest.register({
      id: 'music.soundcloud',
      module: 'music',
      description:
        "The user's own tracks on SoundCloud: `followers`, `tracks` — how many are published, " +
        `\`playsMilestone\` — plays of all tracks rounded down to ${MILESTONE}. Tell about new ` +
        'followers and a new track, congratulate on a new milestone.',
      // Plays grow every day by themselves, so only milestones are compared.
      collect: async (userId) => {
        const stats = await this.soundcloud.stats(userId);
        return (
          stats && {
            followers: stats.followers,
            tracks: stats.tracks.length,
            playsMilestone: Math.floor(stats.totals.plays / MILESTONE) * MILESTONE,
          }
        );
      },
    });
  }
}
