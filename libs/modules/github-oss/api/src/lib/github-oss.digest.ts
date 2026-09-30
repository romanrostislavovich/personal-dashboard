import { Injectable, OnModuleInit } from '@nestjs/common';
import { MorningDigestService } from '@pd/api-core';
import { ReposService } from './repos.service';

/** Open source news in the morning digest: new stars, forks, issues, PRs, releases. */
@Injectable()
export class GithubOssDigest implements OnModuleInit {
  constructor(
    private readonly digest: MorningDigestService,
    private readonly repos: ReposService,
  ) {}

  onModuleInit(): void {
    this.digest.register({
      id: 'github-oss.repos',
      module: 'github-oss',
      description:
        'Open source repositories: stars, forks, open issues and PRs, latest release tag. ' +
        'Tell the differences: new stars and forks, new issues or PRs, a new release.',
      // npm downloads and sync times change every day by themselves, so they are left out.
      collect: async (userId) =>
        (await this.repos.list(userId)).map((repo) => ({
          repo: repo.fullName,
          stars: repo.stars,
          forks: repo.forks,
          openIssues: repo.openIssues,
          openPulls: repo.openPulls,
          latestRelease: repo.latestRelease?.tag ?? null,
        })),
    });
  }
}
