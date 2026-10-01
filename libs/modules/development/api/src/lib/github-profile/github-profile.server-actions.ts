import { Injectable, OnModuleInit } from '@nestjs/common';
import { ServerActions } from '@pd/api-core';
import { GithubProfileService } from './github-profile.service';

/** GitHub requests run on the server (see ServerActions). */
export const GITHUB_PROFILE_ACTIONS = {
  sync: 'development.sync-github-profile',
} as const;

@Injectable()
export class GithubProfileServerActions implements OnModuleInit {
  constructor(
    private readonly actions: ServerActions,
    private readonly profile: GithubProfileService,
  ) {}

  onModuleInit(): void {
    this.actions.register(GITHUB_PROFILE_ACTIONS.sync, (userId) => this.profile.sync(userId));
  }
}
