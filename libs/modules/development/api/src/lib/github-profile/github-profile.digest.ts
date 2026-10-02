import { Injectable, OnModuleInit } from '@nestjs/common';
import { MorningDigestService } from '@pd/api-core';
import { GithubProfileService } from './github-profile.service';

/** Contribution milestones are counted in these steps. */
const MILESTONE = 500;

/**
 * The GitHub account in the morning digest: followers and milestones. (The streak reminder
 * counts all services, see accounts.digest.ts.)
 */
@Injectable()
export class GithubProfileDigest implements OnModuleInit {
  constructor(
    private readonly digest: MorningDigestService,
    private readonly profiles: GithubProfileService,
  ) {}

  onModuleInit(): void {
    this.digest.register({
      id: 'development.github-profile',
      module: 'development',
      description:
        "The user's GitHub account: `followers`, `contributionMilestone` — total contributions " +
        `rounded down to ${MILESTONE}. Tell about new followers, congratulate on a new milestone.`,
      // Contributions grow every day by themselves, so only milestones are compared.
      collect: async (userId) => {
        const profile = await this.profiles.profile(userId);
        return (
          profile && {
            followers: profile.followers,
            contributionMilestone: Math.floor(profile.totalContributions / MILESTONE) * MILESTONE,
          }
        );
      },
    });
  }
}
