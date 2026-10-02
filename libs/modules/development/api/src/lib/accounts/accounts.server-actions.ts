import { Injectable, OnModuleInit } from '@nestjs/common';
import { ServerActions } from '@pd/api-core';
import {
  bitbucketTokenInputSchema,
  codeProviderSchema,
  gitlabTokenInputSchema,
} from '@pd/contracts';
import { z } from 'zod';
import { AccountTokensService } from './account-tokens.service';
import { AccountsService } from './accounts.service';

/** GitLab and Bitbucket requests run on the server (see ServerActions). */
export const ACCOUNT_ACTIONS = {
  sync: 'development.sync-account',
  saveGitlabToken: 'development.save-gitlab-token',
  saveBitbucketToken: 'development.save-bitbucket-token',
} as const;

const syncArgsSchema = z.object({ provider: codeProviderSchema });

@Injectable()
export class AccountsServerActions implements OnModuleInit {
  constructor(
    private readonly actions: ServerActions,
    private readonly accounts: AccountsService,
    private readonly tokens: AccountTokensService,
  ) {}

  onModuleInit(): void {
    this.actions.register(ACCOUNT_ACTIONS.sync, (userId, args) =>
      this.accounts.sync(userId, syncArgsSchema.parse(args).provider),
    );
    // A token is checked against its service before it is saved.
    this.actions.register(ACCOUNT_ACTIONS.saveGitlabToken, (userId, args) =>
      this.tokens.saveGitlab(userId, gitlabTokenInputSchema.parse(args).token),
    );
    this.actions.register(ACCOUNT_ACTIONS.saveBitbucketToken, (userId, args) =>
      this.tokens.saveBitbucket(userId, bitbucketTokenInputSchema.parse(args)),
    );
  }
}
