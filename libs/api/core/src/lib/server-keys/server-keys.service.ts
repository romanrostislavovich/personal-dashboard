import { ForbiddenException, Injectable } from '@nestjs/common';
import { SecretsService } from '../secrets/secrets.service';
import { UsersService } from '../users/users.service';

/**
 * The server's own keys at outside services — the Telegram bot, the Spotify app, the
 * LanguageTool server, the open-banking application — that its owner sets in Settings → Integrations (they used to be in
 * .env). The same names a module uses: `telegram.bot-token`, `music.spotify-client-id`.
 */
export type ServerKey =
  | 'telegram.bot-token'
  | 'music.spotify-client-id'
  | 'music.spotify-client-secret'
  | 'writing.languagetool-url'
  | 'finance.enablebanking-app-id'
  | 'finance.enablebanking-key'
  | 'push.fcm-service-account';

/** Kept among the owner's secrets: encrypted, and synced to a sync client with the rest. */
const PREFIX = 'server.';
/**
 * How long a read value is trusted: a key set on the other instance arrives with the sync and
 * is picked up this soon after.
 */
const CACHE_MS = 60_000;

@Injectable()
export class ServerKeysService {
  private readonly cache = new Map<ServerKey, { value: string | null; readAt: number }>();

  constructor(
    private readonly users: UsersService,
    private readonly secrets: SecretsService,
  ) {}

  /** Only the owner (the first user) sets the server's keys. */
  async isOwner(userId: string): Promise<boolean> {
    return (await this.users.owner())?.id === userId;
  }

  async assertOwner(userId: string): Promise<void> {
    if (!(await this.isOwner(userId))) {
      throw new ForbiddenException('Only the owner of the dashboard sets the keys of the server');
    }
  }

  async get(key: ServerKey): Promise<string | null> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.readAt < CACHE_MS) {
      return cached.value;
    }
    const owner = await this.users.owner();
    const value = owner
      ? await this.secrets.get(owner.id, PREFIX + key).catch(() => null) // another ENCRYPTION_KEY
      : null;
    this.cache.set(key, { value, readAt: Date.now() });
    return value;
  }

  /** `null` removes the key. Checking that it works is the module's job, before. */
  async set(key: ServerKey, value: string | null): Promise<void> {
    const owner = await this.users.owner();
    if (!owner) {
      return;
    }
    if (value === null) {
      await this.secrets.delete(owner.id, PREFIX + key);
    } else {
      await this.secrets.set(owner.id, PREFIX + key, value);
    }
    this.cache.set(key, { value, readAt: Date.now() });
  }
}
