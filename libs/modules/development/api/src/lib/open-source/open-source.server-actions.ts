import { Injectable, OnModuleInit } from '@nestjs/common';
import { ServerActions } from '@pd/api-core';
import { trackedRepoInputSchema } from '@pd/contracts';
import { ReposService } from './repos.service';

/** Requests to GitHub, GitLab, Bitbucket and npm run on the server (see ServerActions). */
export const OPEN_SOURCE_ACTIONS = {
  addRepo: 'development.add-repo',
  syncAll: 'development.sync-repos',
} as const;

@Injectable()
export class OpenSourceServerActions implements OnModuleInit {
  constructor(
    private readonly actions: ServerActions,
    private readonly repos: ReposService,
  ) {}

  onModuleInit(): void {
    this.actions.register(OPEN_SOURCE_ACTIONS.addRepo, (userId, args) => {
      const input = trackedRepoInputSchema.parse(args);
      return this.repos.add(userId, input.provider, input.repo, input.npmPackage ?? null);
    });
    // The events are for the hourly job's notifications; a manual refresh returns nothing.
    this.actions.register(OPEN_SOURCE_ACTIONS.syncAll, async (userId) => {
      await this.repos.syncAll(userId);
    });
  }
}
