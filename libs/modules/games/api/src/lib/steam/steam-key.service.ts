import { BadRequestException, Injectable } from '@nestjs/common';
import { SecretsService } from '@pd/api-core';
import { SteamClient, SteamKeyError } from './steam.client';

const KEY_SECRET = 'games.steam-key';

/**
 * The user's Steam Web API key (stored encrypted in the core). One key is enough for any number
 * of Steam accounts: it reads every public profile.
 */
@Injectable()
export class SteamKeyService {
  constructor(private readonly secrets: SecretsService) {}

  has(userId: string): Promise<boolean> {
    return this.secrets.has(userId, KEY_SECRET);
  }

  /** A client with the user's key; `null` — no key, nothing can be read from Steam. */
  async clientFor(userId: string): Promise<SteamClient | null> {
    const key = await this.secrets.get(userId, KEY_SECRET);
    return key ? new SteamClient(key) : null;
  }

  async save(userId: string, apiKey: string): Promise<void> {
    try {
      await new SteamClient(apiKey).verify();
    } catch (error) {
      if (error instanceof SteamKeyError) {
        throw new BadRequestException('Steam Web API key is invalid');
      }
      throw error;
    }
    await this.secrets.set(userId, KEY_SECRET, apiKey);
  }

  remove(userId: string): Promise<void> {
    return this.secrets.delete(userId, KEY_SECRET);
  }
}
