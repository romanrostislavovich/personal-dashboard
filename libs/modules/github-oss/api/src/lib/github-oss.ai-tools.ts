import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS } from '@pd/api-core';
import { trackedRepoInputSchema } from '@pd/contracts';
import { ReposService } from './repos.service';

/** AI access to open source statistics; tracking a repository (assistant). */
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

    this.ai.registerTool({
      name: 'github_track_repo',
      module: 'github-oss',
      writes: true,
      description: 'Starts tracking a GitHub repository (stars, issues, releases, npm downloads).',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'owner/name or a github.com link' },
          npmPackage: { type: 'string', description: 'npm package name, if it is published' },
        },
        required: ['repo'],
      },
      handler: async (userId, args) => {
        const { repo, npmPackage } = trackedRepoInputSchema.parse(args);
        await this.repos.add(userId, repo, npmPackage ?? null);
        return { tracking: repo };
      },
    });
  }
}
