import { Injectable, OnModuleInit } from '@nestjs/common';
import { ServerActions } from '@pd/api-core';
import { trackedRepoInputSchema } from '@pd/contracts';
import { z } from 'zod';
import { ReposService } from './repos.service';

/** GitHub and npm requests run on the server (see ServerActions). */
export const OPEN_SOURCE_ACTIONS = {
  addRepo: 'development.add-repo',
  updateRepo: 'development.update-repo',
  syncAll: 'development.sync-repos',
  syncRepo: 'development.sync-repo',
} as const;

const idArgs = z.object({ id: z.uuid() });
const updateArgs = z.object({ id: z.uuid(), input: trackedRepoInputSchema });

@Injectable()
export class OpenSourceServerActions implements OnModuleInit {
  constructor(
    private readonly actions: ServerActions,
    private readonly repos: ReposService,
  ) {}

  onModuleInit(): void {
    this.actions.register(OPEN_SOURCE_ACTIONS.addRepo, (userId, args) => {
      const input = trackedRepoInputSchema.parse(args);
      return this.repos.add(userId, input.repo, input.npmPackage ?? null);
    });
    this.actions.register(OPEN_SOURCE_ACTIONS.updateRepo, (userId, args) => {
      const { id, input } = updateArgs.parse(args);
      return this.repos.update(userId, id, input.repo, input.npmPackage ?? null);
    });
    // The events are for the hourly job's notifications; a manual refresh returns nothing.
    this.actions.register(OPEN_SOURCE_ACTIONS.syncAll, async (userId) => {
      await this.repos.syncAll(userId);
    });
    this.actions.register(OPEN_SOURCE_ACTIONS.syncRepo, (userId, args) =>
      this.repos.syncOne(userId, idArgs.parse(args).id),
    );
  }
}
