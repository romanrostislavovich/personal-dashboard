import { Injectable, OnModuleInit } from '@nestjs/common';
import { MorningDigestService } from '@pd/api-core';
import { GithubProfileService } from './github-profile.service';

/** Contribution milestones are counted in these steps. */
const MILESTONE = 500;

/** The GitHub account in the morning digest: followers, milestones and the streak reminder. */
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

    // Off by default: the user switches it on under the morning digest in the AI settings.
    this.digest.register({
      id: 'development.streak',
      module: 'development',
      optIn: true,
      always: true,
      description:
        'A reminder about the GitHub contribution streak: `currentStreak` days in a row, ' +
        '`contributedToday` — whether today already has a contribution. If not, remind in one ' +
        'line to contribute today so the streak does not break.',
      collect: async (userId) => {
        const profile = await this.profiles.profile(userId);
        // Nothing to lose without a streak.
        return profile && profile.streak.current > 0
          ? { currentStreak: profile.streak.current, contributedToday: profile.today > 0 }
          : null;
      },
    });
  }
}
