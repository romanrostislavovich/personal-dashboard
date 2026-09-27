import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { AppConfig } from '../config/env';
import { DB, Database } from '../database/database.module';
import { userSecrets } from './secrets.schema';

const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypted storage for integration tokens.
 * Example: `await secrets.set(userId, 'github-oss.token', token)`.
 *
 * Values are never sent to the frontend — only a "configured / not" flag.
 */
@Injectable()
export class SecretsService {
  private readonly key: Buffer;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) config: AppConfig,
  ) {
    // sha256 turns a key of any length into exactly 32 bytes for AES-256.
    this.key = createHash('sha256')
      .update(config.get('ENCRYPTION_KEY', { infer: true }))
      .digest();
  }

  async get(userId: string, key: string): Promise<string | null> {
    const [row] = await this.db
      .select()
      .from(userSecrets)
      .where(and(eq(userSecrets.userId, userId), eq(userSecrets.key, key)));
    return row ? this.decrypt(row.encryptedValue) : null;
  }

  async has(userId: string, key: string): Promise<boolean> {
    const count = await this.db.$count(
      userSecrets,
      and(eq(userSecrets.userId, userId), eq(userSecrets.key, key)),
    );
    return count > 0;
  }

  async set(userId: string, key: string, value: string): Promise<void> {
    const encryptedValue = this.encrypt(value);
    await this.db
      .insert(userSecrets)
      .values({ userId, key, encryptedValue })
      .onConflictDoUpdate({
        target: [userSecrets.userId, userSecrets.key],
        set: { encryptedValue, updatedAt: new Date() },
      });
  }

  async delete(userId: string, key: string): Promise<void> {
    await this.db
      .delete(userSecrets)
      .where(and(eq(userSecrets.userId, userId), eq(userSecrets.key, key)));
  }

  /** Format: `iv.authTag.ciphertext` in base64. */
  private encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join('.');
  }

  private decrypt(stored: string): string {
    const [iv, authTag, encrypted] = stored.split('.').map((part) => Buffer.from(part, 'base64'));
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}
