import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, findById, idParameters, NO_PARAMETERS, ServerActions } from '@pd/api-core';
import { trackedRepoInputSchema, trackedRepoUpdateSchema } from '@pd/contracts';
import { z } from 'zod';
import { ReposService } from './repos.service';
import { OPEN_SOURCE_ACTIONS } from './open-source.server-actions';

const settingsSchema = trackedRepoUpdateSchema.pick({ hidden: true, notify: true });

/** AI access to open source statistics; adding, hiding and refreshing repositories (assistant). */
const repoArgs = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  provider: z.enum(['github', 'gitlab', 'bitbucket']).optional(),
  relation: z.enum(['owner', 'organization', 'manual']).optional(),
  limit: z.number().int().min(1).max(150).default(40),
});

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
        "Repositories from GitHub, GitLab and Bitbucket (`provider`): the user's own " +
        '(`relation: owner`), public (open source) and private (`isPrivate`), those of ' +
        'their organizations (`organization`) and ones added by hand (`manual`). For each: id, ' +
        'stars and growth over 7/30 days, forks, open issues and PRs, language, latest release, ' +
        'weekly npm downloads, whether it is a fork, archived, hidden, has notifications on. ' +
        'The most starred first; only `limit` (40 by default) are returned and `total` says ' +
        'how many match — find one with `search` (a part of its name, description or ' +
        'language) or narrow by `provider` or `relation`.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'A part of the name, description or language' },
          provider: { type: 'string', enum: ['github', 'gitlab', 'bitbucket'] },
          relation: { type: 'string', enum: ['owner', 'organization', 'manual'] },
          limit: { type: 'number', description: '1–150, default 40' },
        },
      },
      handler: async (userId, args) => {
        const { search, provider, relation, limit } = repoArgs.parse(args);
        const part = search?.toLowerCase();
        const found = (await this.repos.list(userId))
          .filter(
            (repo) =>
              (!provider || repo.provider === provider) &&
              (!relation || repo.relation === relation) &&
              (!part ||
                [repo.fullName, repo.description, repo.language].some((text) =>
                  text?.toLowerCase().includes(part),
                )),
          )
          .sort((a, b) => b.stars - a.stars);
        return {
          total: found.length,
          shown: Math.min(found.length, limit),
          // The chart, the address and what is empty are of no use to the model.
          repos: found.slice(0, limit).map((repo) => ({
            ...repo,
            history: undefined,
            htmlUrl: undefined,
            lastSyncedAt: undefined,
          })),
        };
      },
    });

    this.ai.registerTool({
      name: 'github_track_repo',
      module: 'development',
      writes: true,
      description:
        "Adds a repository that is not the user's own (theirs appear by themselves) from " +
        'GitHub, GitLab or Bitbucket: stars, issues, releases, npm downloads. The service must ' +
        'be connected.',
      parameters: {
        type: 'object',
        properties: {
          repo: {
            type: 'string',
            description:
              'A link to the repository on github.com, gitlab.com or bitbucket.org; a bare ' +
              'owner/name means GitHub',
          },
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
