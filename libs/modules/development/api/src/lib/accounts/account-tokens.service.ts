import { BadRequestException, Injectable } from '@nestjs/common';
import { SecretsService } from '@pd/api-core';
import { BitbucketTokenInput, CodeAccountsSettings, TokenProvider } from '@pd/contracts';
import { BitbucketAccountSource } from '../bitbucket/bitbucket-account.source';
import { BitbucketRepoSource } from '../bitbucket/bitbucket-repos.source';
import { BitbucketWorkspaces } from '../bitbucket/bitbucket-workspaces';
import { BitbucketClient, BitbucketCredentials } from '../bitbucket/bitbucket.client';
import { GithubTokenService } from '../github/github-token.service';
import { GitlabAccountSource } from '../gitlab/gitlab-account.source';
import { GitlabRepoSource } from '../gitlab/gitlab-repos.source';
import { GitlabClient } from '../gitlab/gitlab.client';
import { RepoSource } from '../open-source/repo-source';
import { AccountAuthError, AccountSource } from './account-source';

const KEYS: Record<TokenProvider, string> = {
  gitlab: 'development.gitlab-token',
  // The e-mail and the token together, as JSON.
  bitbucket: 'development.bitbucket-token',
};

/** What a connected service gives: its account and its public repositories. */
export interface ServiceSources {
  account: AccountSource;
  repos: RepoSource;
}

/**
 * The user's GitLab and Bitbucket credentials (stored encrypted in the core) and the clients
 * made with them. The GitHub token has a service of its own (github-token.service.ts).
 */
@Injectable()
export class AccountTokensService {
  constructor(
    private readonly secrets: SecretsService,
    private readonly github: GithubTokenService,
  ) {}

  has(userId: string, provider: TokenProvider): Promise<boolean> {
    return this.secrets.has(userId, KEYS[provider]);
  }

  async settings(userId: string): Promise<CodeAccountsSettings> {
    const [github, gitlab, bitbucket] = await Promise.all([
      this.github.hasToken(userId),
      this.has(userId, 'gitlab'),
      this.has(userId, 'bitbucket'),
    ]);
    return { github, gitlab, bitbucket };
  }

  /** `null` — the service is not connected: nothing is read from it then. */
  async sources(userId: string, provider: TokenProvider): Promise<ServiceSources | null> {
    const secret = await this.secrets.get(userId, KEYS[provider]);
    if (!secret) {
      return null;
    }
    return provider === 'gitlab' ? gitlabSources(secret) : bitbucketSources(JSON.parse(secret));
  }

  /** The token is checked against GitLab before it is saved. */
  async saveGitlab(userId: string, token: string): Promise<void> {
    await this.verify(() => new GitlabClient(token).get('/user'));
    await this.secrets.set(userId, KEYS.gitlab, token);
  }

  async saveBitbucket(userId: string, credentials: BitbucketTokenInput): Promise<void> {
    await this.verify(() => new BitbucketWorkspaces(new BitbucketClient(credentials)).me());
    await this.secrets.set(userId, KEYS.bitbucket, JSON.stringify(credentials));
  }

  remove(userId: string, provider: TokenProvider): Promise<void> {
    return this.secrets.delete(userId, KEYS[provider]);
  }

  /** A refused token is the user's mistake (400); anything else is the service's trouble. */
  private async verify(check: () => Promise<unknown>): Promise<void> {
    try {
      await check();
    } catch (error) {
      if (error instanceof AccountAuthError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}

function gitlabSources(token: string): ServiceSources {
  const client = new GitlabClient(token);
  return { account: new GitlabAccountSource(client), repos: new GitlabRepoSource(client) };
}

function bitbucketSources(credentials: BitbucketCredentials): ServiceSources {
  const client = new BitbucketClient(credentials);
  const workspaces = new BitbucketWorkspaces(client);
  return {
    account: new BitbucketAccountSource(client, workspaces, credentials.email),
    repos: new BitbucketRepoSource(client, workspaces),
  };
}
