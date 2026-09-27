import { BadRequestException, Injectable } from '@nestjs/common';
import { SecretsService } from '@pd/api-core';
import { GithubSettings } from '@pd/contracts';
import { GithubAuthError, GithubClient } from './clients/github.client';

const TOKEN_KEY = 'github-oss.token';

/** The user's personal GitHub token (stored encrypted in the core). */
@Injectable()
export class GithubTokenService {
  constructor(private readonly secrets: SecretsService) {}

  /** A client with the user's token, or an anonymous one if there is no token. */
  async clientFor(userId: string): Promise<GithubClient> {
    return new GithubClient(await this.secrets.get(userId, TOKEN_KEY));
  }

  async settings(userId: string): Promise<GithubSettings> {
    return { tokenConfigured: await this.secrets.has(userId, TOKEN_KEY) };
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
