import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
  createVault,
  rewrapVault,
  unlockVault,
  unlockWithRecoveryKey,
  vaultApi,
  VaultKey,
} from '@pd/client-core';
import { OpenVaultItem, VaultItem, VaultKeysState } from '@pd/contracts';
import { DASHBOARD_CLIENT } from '@pd/web-core';

/** The vault locks itself after this long without the user doing anything in it. */
const AUTO_LOCK_MS = 10 * 60_000;

/**
 * The open vault of this tab. The vault key lives only here, in memory: never in storage, never
 * sent anywhere. Locking forgets it (and the opened items); so do closing the tab and
 * AUTO_LOCK_MS without a touch.
 */
@Injectable({ providedIn: 'root' })
export class VaultSession {
  private readonly api = vaultApi(inject(DASHBOARD_CLIENT).api);
  private vaultKey: VaultKey | null = null;
  private lockTimer: ReturnType<typeof setTimeout> | null = null;

  /** `undefined` — not loaded yet; `null` — the vault is not set up. */
  readonly keys = signal<VaultKeysState | null | undefined>(undefined);
  readonly unlocked = signal(false);
  readonly items = signal<OpenVaultItem[]>([]);
  /** Items that could not be opened (should not happen; told, not hidden). */
  readonly unreadable = signal(0);
  readonly sorted = computed(() =>
    [...this.items()].sort(
      (a, b) => Number(b.favorite) - Number(a.favorite) || a.title.localeCompare(b.title),
    ),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.lock());
  }

  async load(): Promise<void> {
    this.keys.set((await this.api.keys()).keys);
  }

  /** A new vault; returns its recovery key, to show once. The vault is open after it. */
  async create(masterPassword: string): Promise<string> {
    const { keys, recoveryKey, vaultKey } = await createVault(masterPassword);
    await this.api.createKeys(keys);
    await this.load();
    await this.open(vaultKey);
    return recoveryKey;
  }

  /** Throws WrongVaultPasswordError for a wrong one. */
  async unlock(masterPassword: string): Promise<void> {
    await this.open(await unlockVault(this.requireKeys(), masterPassword));
  }

  /**
   * The forgotten master password: the recovery key opens the vault, and a new master password
   * is set at once (the account password confirms it is the owner).
   */
  async recover(
    recoveryKey: string,
    newMasterPassword: string,
    accountPassword: string,
  ): Promise<void> {
    const keys = this.requireKeys();
    const vaultKey = await unlockWithRecoveryKey(keys, recoveryKey);
    await this.api.changeKeys({
      ...(await rewrapVault(keys, vaultKey, newMasterPassword)),
      accountPassword,
    });
    await this.load();
    await this.open(vaultKey);
  }

  async changeMasterPassword(newMasterPassword: string, accountPassword: string): Promise<void> {
    const vaultKey = this.requireOpen();
    await this.api.changeKeys({
      ...(await rewrapVault(this.requireKeys(), vaultKey, newMasterPassword)),
      accountPassword,
    });
    await this.load();
    this.touch();
  }

  async save(item: VaultItem, id?: string): Promise<void> {
    await this.api.save(this.requireOpen(), item, id);
    await this.refresh();
  }

  async remove(id: string): Promise<void> {
    this.requireOpen();
    await this.api.remove(id);
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const { items, unreadable } = await this.api.open(this.requireOpen());
    this.items.set(items);
    this.unreadable.set(unreadable);
    this.touch();
  }

  lock(): void {
    this.vaultKey = null;
    this.items.set([]);
    this.unreadable.set(0);
    this.unlocked.set(false);
    if (this.lockTimer) {
      clearTimeout(this.lockTimer);
      this.lockTimer = null;
    }
  }

  /** The user did something in the vault: the automatic lock waits again. */
  touch(): void {
    if (!this.vaultKey) {
      return;
    }
    if (this.lockTimer) {
      clearTimeout(this.lockTimer);
    }
    this.lockTimer = setTimeout(() => this.lock(), AUTO_LOCK_MS);
  }

  private async open(vaultKey: VaultKey): Promise<void> {
    this.vaultKey = vaultKey;
    this.unlocked.set(true);
    await this.refresh();
  }

  private requireKeys(): VaultKeysState {
    const keys = this.keys();
    if (!keys) {
      throw new Error('The vault is not set up');
    }
    return keys;
  }

  private requireOpen(): VaultKey {
    if (!this.vaultKey) {
      throw new Error('The vault is locked');
    }
    this.touch();
    return this.vaultKey;
  }
}
