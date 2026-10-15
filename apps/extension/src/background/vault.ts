import {
  fromBase64,
  restoreVaultKey,
  toBase64,
  unlockVault,
  vaultApi,
  VaultKey,
  WrongVaultPasswordError,
} from '@pd/client-core';
import { OpenVaultItem, VaultItem } from '@pd/contracts';
import { ExtensionError, VaultStatus } from '../shared/messages';
import { signedInClient } from './account';
import { chromeStore } from './storage';

/** The open vault key, in session storage (memory, never disk): see restoreVaultKey. */
const KEY = 'vaultKey';
export const LOCK_ALARM = 'vault-lock';
/** As on the dashboard's page: locked after this long without being used. */
const AUTO_LOCK_MINUTES = 10;

const session = chromeStore(chrome.storage.session);

/** The open key and the items opened with it, while this service worker is awake. */
let open: VaultKey | null = null;
let opened: { items: OpenVaultItem[]; unreadable: number } | null = null;

async function api() {
  return vaultApi((await signedInClient()).api);
}

export async function vaultStatus(): Promise<VaultStatus> {
  if (await openKey()) {
    return 'unlocked';
  }
  const { keys } = await api().then((vault) => vault.keys());
  return keys ? 'locked' : 'none';
}

/** Throws `wrong-master` for a wrong master password. */
export async function unlock(masterPassword: string): Promise<void> {
  const { keys } = await (await api()).keys();
  if (!keys) {
    throw new ExtensionError('no-vault');
  }
  try {
    open = await unlockVault(keys, masterPassword);
  } catch (error) {
    throw error instanceof WrongVaultPasswordError ? new ExtensionError('wrong-master') : error;
  }
  opened = null;
  await session.set(KEY, toBase64(open.raw));
  touch();
}

/** Forgets the key and the opened items here; the next use asks for the master password. */
export async function lock(): Promise<void> {
  open = null;
  opened = null;
  await session.remove(KEY);
  await chrome.alarms.clear(LOCK_ALARM);
}

/**
 * The opened items. `fresh` — asked from the server again (the popup opens: something may have
 * changed on the dashboard). `use` — the user did something, the automatic lock waits again;
 * the badge counting the logins of a page is not that.
 */
export async function vaultItems({ fresh = false, use = true } = {}): Promise<{
  items: OpenVaultItem[];
  unreadable: number;
}> {
  const key = await requireOpen();
  if (!opened || fresh) {
    opened = await (await api()).open(key);
  }
  if (use) {
    touch();
  }
  return opened;
}

export async function vaultItem(id: string): Promise<OpenVaultItem> {
  const item = (await vaultItems()).items.find((candidate) => candidate.id === id);
  if (!item) {
    throw new ExtensionError('failed');
  }
  return item;
}

/** A new item, or a changed one (`id`): encrypted here, before it leaves. */
export async function saveItem(item: VaultItem, id?: string): Promise<void> {
  await (await api()).save(await requireOpen(), item, id);
  opened = null;
  touch();
}

export async function isUnlocked(): Promise<boolean> {
  return (await openKey()) !== null;
}

async function openKey(): Promise<VaultKey | null> {
  if (!open) {
    const raw = await session.get(KEY);
    open = raw ? await restoreVaultKey(fromBase64(raw)) : null;
  }
  return open;
}

async function requireOpen(): Promise<VaultKey> {
  const key = await openKey();
  if (!key) {
    throw new ExtensionError('locked');
  }
  return key;
}

function touch(): void {
  void chrome.alarms.create(LOCK_ALARM, { delayInMinutes: AUTO_LOCK_MINUTES });
}

/** The fields an item is saved with: what it holds, without its record (id, dates). */
export function itemFields(item: OpenVaultItem): VaultItem {
  const { kind, title, urls, username, password, notes, favorite, source } = item;
  return { kind, title, urls, username, password, notes, favorite, ...(source ? { source } : {}) };
}
