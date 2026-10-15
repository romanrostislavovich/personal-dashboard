import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuthService, DB, Database } from '@pd/api-core';
import {
  VaultItemInput,
  VaultItemRecord,
  VaultKeys,
  VaultKeysChange,
  VaultKeysState,
} from '@pd/contracts';
import { and, asc, eq } from 'drizzle-orm';
import { vaultItems, vaultKeys } from './vault.schema';

/**
 * The vault as the server sees it: ciphertext to keep and to hand back. Nothing here can open
 * it — the keys are wrapped by the master password, which never leaves the device.
 */
@Injectable()
export class VaultService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly auth: AuthService,
  ) {}

  /** `null` — the vault is not set up yet. */
  async keys(userId: string): Promise<VaultKeysState | null> {
    const [row] = await this.db.select().from(vaultKeys).where(eq(vaultKeys.userId, userId));
    if (!row) {
      return null;
    }
    return {
      kdf: 'pbkdf2-sha256',
      iterations: row.iterations,
      salt: row.salt,
      wrappedByPassword: row.wrappedByPassword,
      wrappedByRecovery: row.wrappedByRecovery,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** The first keys of a new vault; a vault that exists is changed by `changeKeys`. */
  async createKeys(userId: string, keys: VaultKeys): Promise<void> {
    const created = await this.db
      .insert(vaultKeys)
      .values({ userId, ...keys })
      .onConflictDoNothing()
      .returning({ userId: vaultKeys.userId });
    if (!created.length) {
      throw new ConflictException('The vault is set up already');
    }
  }

  /**
   * New keys of a vault that exists (a new master password). The account password is asked
   * for: with a stolen session alone, keys of someone else's would lock the owner out.
   */
  async changeKeys(userId: string, { accountPassword, ...keys }: VaultKeysChange): Promise<void> {
    await this.auth.checkPassword(userId, accountPassword);
    const changed = await this.db
      .update(vaultKeys)
      .set({ ...keys, updatedAt: new Date() })
      .where(eq(vaultKeys.userId, userId))
      .returning({ userId: vaultKeys.userId });
    if (!changed.length) {
      throw new NotFoundException('The vault is not set up');
    }
  }

  async items(userId: string): Promise<VaultItemRecord[]> {
    const rows = await this.db
      .select()
      .from(vaultItems)
      .where(eq(vaultItems.userId, userId))
      .orderBy(asc(vaultItems.createdAt));
    return rows.map(toRecord);
  }

  async addItem(userId: string, input: VaultItemInput): Promise<VaultItemRecord> {
    await this.requireKeys(userId);
    const [row] = await this.db.insert(vaultItems).values({ userId, data: input.data }).returning();
    return toRecord(row);
  }

  async updateItem(userId: string, id: string, input: VaultItemInput): Promise<VaultItemRecord> {
    const [row] = await this.db
      .update(vaultItems)
      .set({ data: input.data, updatedAt: new Date() })
      .where(and(eq(vaultItems.id, id), eq(vaultItems.userId, userId)))
      .returning();
    if (!row) {
      throw new NotFoundException();
    }
    return toRecord(row);
  }

  async removeItem(userId: string, id: string): Promise<void> {
    await this.db
      .delete(vaultItems)
      .where(and(eq(vaultItems.id, id), eq(vaultItems.userId, userId)));
  }

  /** Items are written only into a vault that exists: without its keys they could not be read. */
  private async requireKeys(userId: string): Promise<void> {
    if (!(await this.keys(userId))) {
      throw new ConflictException('Set up the vault first');
    }
  }
}

function toRecord(row: typeof vaultItems.$inferSelect): VaultItemRecord {
  return {
    id: row.id,
    data: row.data,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
