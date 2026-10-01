import { BadRequestException, Injectable } from '@nestjs/common';
import { SecretsService } from '@pd/api-core';
import { openDota, OpenDotaKeyError } from './opendota.client';

/** The secret of one Dota account's key; the id is the game account's. */
const keySecret = (accountId: string) => `games.opendota-key.${accountId}`;

/**
 * OpenDota API keys (stored encrypted in the core), one per Dota account: every account can go
 * through the key of the OpenDota user it belongs to.
 */
@Injectable()
export class OpenDotaKeyService {
  constructor(private readonly secrets: SecretsService) {}

  /** `null` — no key: requests go within OpenDota's free allowance. */
  get(userId: string, accountId: string): Promise<string | null> {
    return this.secrets.get(userId, keySecret(accountId));
  }

  /** Which of the accounts have a key. */
  async accountsWithKey(userId: string, accountIds: string[]): Promise<string[]> {
    const withKey = await Promise.all(
      accountIds.map(async (id) => ((await this.secrets.has(userId, keySecret(id))) ? [id] : [])),
    );
    return withKey.flat();
  }

  async save(userId: string, accountId: string, apiKey: string): Promise<void> {
    try {
      await openDota.verifyKey(apiKey);
    } catch (error) {
      if (error instanceof OpenDotaKeyError) {
        throw new BadRequestException('OpenDota API key is invalid');
      }
      throw error;
    }
    await this.secrets.set(userId, keySecret(accountId), apiKey);
  }

  remove(userId: string, accountId: string): Promise<void> {
    return this.secrets.delete(userId, keySecret(accountId));
  }
}
