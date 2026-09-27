import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS } from '@pd/api-core';
import { ReposService } from './repos.service';

/** AI access to open source statistics. */
@Injectable()
export class GithubOssAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly repos: ReposService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'github_repos',
      module: 'github-oss',
      description:
        'Open source repositories: stars and growth over 7/30 days, forks, open issues and PRs, ' +
        'latest release, weekly npm downloads.',
      parameters: NO_PARAMETERS,
      handler: async (userId) =>
        (await this.repos.list(userId)).map((repo) => ({ ...repo, history: undefined })),
    });
  }
}
