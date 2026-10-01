import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, findById, idParameters, NO_PARAMETERS, ServerActions } from '@pd/api-core';
import { trackedRepoInputSchema, trackedRepoUpdateSchema } from '@pd/contracts';
import { ReposService } from './repos.service';
import { OPEN_SOURCE_ACTIONS } from './open-source.server-actions';

const settingsSchema = trackedRepoUpdateSchema.pick({ hidden: true, notify: true });

/** AI access to open source statistics; adding, hiding and refreshing repositories (assistant). */
@Injectable()
export class OpenSourceAiTools implements OnModuleInit {
  constructor(
    private readonly actions: ServerActions,
    private readonly ai: AiService,
    private readonly repos: ReposService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'github_repos',
      module: 'development',
      description:
        "Open source repositories: the user's own public ones (`relation: owner`), those of " +
        'their organizations (`organization`) and ones added by hand (`manual`). For each: id, ' +
        'stars and growth over 7/30 days, forks, open issues and PRs, language, latest release, ' +
        'weekly npm downloads, whether it is a fork, archived, hidden, has notifications on.',
      parameters: NO_PARAMETERS,
      handler: async (userId) =>
        (await this.repos.list(userId)).map((repo) => ({ ...repo, history: undefined })),
    });

    this.ai.registerTool({
      name: 'github_track_repo',
      module: 'development',
      writes: true,
      description:
        "Adds a GitHub repository that is not the user's own (theirs appear by themselves): " +
        'stars, issues, releases, npm downloads.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'owner/name or a github.com link' },
          npmPackage: { type: 'string', description: 'npm package name, if it is published' },
        },
        required: ['repo'],
      },
      handler: async (userId, args) => {
        const input = trackedRepoInputSchema.parse(args);
        await this.actions.run(userId, OPEN_SOURCE_ACTIONS.addRepo, input);
        return { tracking: input.repo };
      },
    });

    const find = async (userId: string, args: Record<string, unknown>) =>
      findById(await this.repos.list(userId), args['id'], 'Repository');

    this.ai.registerTool({
      name: 'github_repo_settings',
      module: 'development',
      writes: true,
      description:
        'Hides a repository from the list, the totals and the digest (or shows it again) and ' +
        'switches its notifications about new issues, PRs, releases and star milestones.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Repository id from github_repos' },
          hidden: { type: 'boolean' },
          notify: { type: 'boolean' },
        },
        required: ['id'],
      },
      handler: async (userId, args) => {
        const { id, fullName } = await find(userId, args);
        const settings = settingsSchema.parse(args);
        await this.repos.update(userId, id, settings);
        return { fullName, ...settings };
      },
    });

    this.ai.registerTool({
      name: 'github_untrack_repo',
      module: 'development',
      writes: true,
      confirm: async (userId, args) => {
        const { fullName, stars } = await find(userId, args);
        return { fullName, stars };
      },
      description:
        'Stops tracking a repository added by hand and deletes its collected history. A ' +
        "repository of the user's account cannot be removed — hide it with github_repo_settings.",
      parameters: idParameters('Repository id from github_repos'),
      handler: async (userId, args) => {
        await this.repos.remove(userId, (await find(userId, args)).id);
      },
    });

    this.ai.registerTool({
      name: 'github_sync',
      module: 'development',
      writes: true,
      description:
        'Refreshes repository data from GitHub and npm now instead of waiting for the hourly sync.',
      parameters: NO_PARAMETERS,
      handler: async (userId) => {
        await this.actions.run(userId, OPEN_SOURCE_ACTIONS.syncAll);
        return { refreshed: true };
      },
    });
  }
}
