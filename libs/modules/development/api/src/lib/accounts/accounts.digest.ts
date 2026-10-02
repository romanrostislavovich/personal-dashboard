import { Injectable, OnModuleInit } from '@nestjs/common';
import { MorningDigestService } from '@pd/api-core';
import { AccountsService } from './accounts.service';

/** The streak reminder of the morning digest, counted across all connected services. */
@Injectable()
export class AccountsDigest implements OnModuleInit {
  constructor(
    private readonly digest: MorningDigestService,
    private readonly accounts: AccountsService,
  ) {}

  onModuleInit(): void {
    // Off by default: the user switches it on under the morning digest in the AI settings.
    this.digest.register({
      id: 'development.streak',
      module: 'development',
      optIn: true,
      always: true,
      description:
        'A reminder about the contribution streak across GitHub, GitLab and Bitbucket: ' +
        '`currentStreak` days in a row, `contributedToday` — whether today already has a ' +
        'contribution on any of them. If not, remind in one line to contribute today so the ' +
        'streak does not break.',
      collect: async (userId) => {
        const summary = await this.accounts.summary(userId);
        // Nothing to lose without a streak.
        return summary && summary.streak.current > 0
          ? { currentStreak: summary.streak.current, contributedToday: summary.today > 0 }
          : null;
      },
    });
  }
}
