import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, findById, idParameters, NO_PARAMETERS } from '@pd/api-core';
import { trackedRepoInputSchema } from '@pd/contracts';
import { ReposService } from './repos.service';

/** AI access to open source statistics; tracking, untracking and refreshing repositories (assistant). */
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
        'Open source repositories: id, stars and growth over 7/30 days, forks, open issues and PRs, ' +
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

    const find = async (userId: string, args: Record<string, unknown>) =>
      findById(await this.repos.list(userId), args['id'], 'Repository');

    this.ai.registerTool({
      name: 'github_untrack_repo',
      module: 'github-oss',
      writes: true,
      confirm: async (userId, args) => {
        const { fullName, stars } = await find(userId, args);
        return { fullName, stars };
      },
      description: 'Stops tracking a repository and deletes its collected history.',
      parameters: idParameters('Repository id from github_repos'),
      handler: async (userId, args) => {
        await this.repos.remove(userId, (await find(userId, args)).id);
      },
    });

    this.ai.registerTool({
      name: 'github_sync',
      module: 'github-oss',
      writes: true,
      description:
        'Refreshes repository data from GitHub and npm now instead of waiting for the hourly sync.',
      parameters: NO_PARAMETERS,
      handler: async (userId) => {
        await this.repos.syncAll(userId);
        return { refreshed: true };
      },
    });
  }
}
