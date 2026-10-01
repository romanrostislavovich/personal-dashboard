import { BadRequestException, Injectable } from '@nestjs/common';
import { SecretsService } from '@pd/api-core';
import { openDota, OpenDotaKeyError } from './opendota.client';

const KEY_SECRET = 'games.opendota-key';

/** The user's OpenDota API key (stored encrypted in the core): one key for all Dota accounts. */
@Injectable()
export class OpenDotaKeyService {
  constructor(private readonly secrets: SecretsService) {}

  /** `null` — no key: requests go within OpenDota's free allowance. */
  get(userId: string): Promise<string | null> {
    return this.secrets.get(userId, KEY_SECRET);
  }

  has(userId: string): Promise<boolean> {
    return this.secrets.has(userId, KEY_SECRET);
  }

  async save(userId: string, apiKey: string): Promise<void> {
    try {
      await openDota.verifyKey(apiKey);
    } catch (error) {
      if (error instanceof OpenDotaKeyError) {
        throw new BadRequestException('OpenDota API key is invalid');
      }
      throw error;
    }
    await this.secrets.set(userId, KEY_SECRET, apiKey);
  }

  remove(userId: string): Promise<void> {
    return this.secrets.delete(userId, KEY_SECRET);
  }
}
