import { BadRequestException, Injectable } from '@nestjs/common';
import { SecretsService } from '@pd/api-core';
import { GithubSettings } from '@pd/contracts';
import { GithubAuthError, GithubClient } from './github.client';

const TOKEN_KEY = 'development.github-token';

/** The user's personal GitHub token (stored encrypted in the core). */
@Injectable()
export class GithubTokenService {
  constructor(private readonly secrets: SecretsService) {}

  /** A client with the user's token, or an anonymous one if there is no token. */
  async clientFor(userId: string): Promise<GithubClient> {
    return new GithubClient(await this.secrets.get(userId, TOKEN_KEY));
  }

  /** The token itself, for clients other than `GithubClient` (GraphQL). */
  token(userId: string): Promise<string | null> {
    return this.secrets.get(userId, TOKEN_KEY);
  }

  hasToken(userId: string): Promise<boolean> {
    return this.secrets.has(userId, TOKEN_KEY);
  }

  async settings(userId: string): Promise<GithubSettings> {
    return { tokenConfigured: await this.hasToken(userId) };
  }

  async save(userId: string, token: string): Promise<void> {
    try {
      await new GithubClient(token).getViewerLogin();
    } catch (error) {
      if (error instanceof GithubAuthError) {
        throw new BadRequestException('GitHub token is invalid');
      }
      throw error;
    }
    await this.secrets.set(userId, TOKEN_KEY, token);
  }

  remove(userId: string): Promise<void> {
    return this.secrets.delete(userId, TOKEN_KEY);
  }
}
