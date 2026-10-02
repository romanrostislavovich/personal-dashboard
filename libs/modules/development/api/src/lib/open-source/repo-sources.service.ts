import { Injectable } from '@nestjs/common';
import { REPO_PROVIDERS, RepoProvider } from '@pd/contracts';
import { AccountTokensService } from '../accounts/account-tokens.service';
import { GithubClient } from '../github/github.client';
import { GithubTokenService } from '../github/github-token.service';
import { GithubReposClient } from './github-repos.client';
import { RepoSource } from './repo-source';

/** The services the user connected, as sources of repositories for the Open Source section. */
@Injectable()
export class RepoSourcesService {
  constructor(
    private readonly github: GithubTokenService,
    private readonly tokens: AccountTokensService,
  ) {}

  /** `null` — the service is not connected: there is nothing to read it with. */
  async one(userId: string, provider: RepoProvider): Promise<RepoSource | null> {
    if (provider !== 'github') {
      return (await this.tokens.sources(userId, provider))?.repos ?? null;
    }
    const token = await this.github.token(userId);
    return token ? githubSource(token) : null;
  }

  async all(userId: string): Promise<RepoSource[]> {
    const sources = await Promise.all(REPO_PROVIDERS.map((provider) => this.one(userId, provider)));
    return sources.filter((source) => source !== null);
  }
}

/** GitHub reads repositories over GraphQL and the new issues over REST. */
function githubSource(token: string): RepoSource {
  const repos = new GithubReposClient(token);
  const rest = new GithubClient(token);
  return {
    provider: 'github',
    listAccount: () => repos.listAccount(),
    getMany: (fullNames) => repos.getMany(fullNames),
    listCreatedSince: (fullName, since) => rest.listCreatedSince(fullName, since),
  };
}
