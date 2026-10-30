import {
  OpenVaultItem,
  VaultItem,
  VaultItemRecord,
  VaultKeys,
  VaultKeysChange,
  VaultKeysState,
} from '@pd/contracts';
import {ApiClient, apiRequest} from '../api-client';
import {decryptItem, encryptItem, VaultKey} from '../vault/vault-crypto';

const BASE = '/api/vault';

const VAULT_READS = {
  /** `{ keys: null }` — not set up yet. */
  keys: () => apiRequest(`${BASE}/keys`),
  items: () => apiRequest(`${BASE}/items`),
};

/**
 * The vault's requests. Items go to the server and come back as ciphertext only: `open` and
 * `save` encrypt and decrypt them here, on the device, with the open vault key.
 */
export function vaultApi(api: ApiClient) {
  return {
    keys: () => api.read<{keys: VaultKeysState | null}>(VAULT_READS.keys()),
    createKeys: (keys: VaultKeys) => api.post<void>(`${BASE}/keys`, keys),
    /** A new master password: the account password says it is the owner. */
    changeKeys: (change: VaultKeysChange) =>
      api.put<void>(`${BASE}/keys`, change),

    /** Every item, opened; one that cannot be (a broken record) is left out and counted. */
    open: async (
      vaultKey: VaultKey,
    ): Promise<{items: OpenVaultItem[]; unreadable: number}> => {
      const records = await api.read<VaultItemRecord[]>(VAULT_READS.items());
      const opened = await Promise.all(
        records.map(record =>
          decryptItem(vaultKey, record.data).then(
            (item): OpenVaultItem => ({
              ...item,
              id: record.id,
              createdAt: record.createdAt,
              updatedAt: record.updatedAt,
            }),
            () => null,
          ),
        ),
      );
      const items = opened.filter(
        (item): item is OpenVaultItem => item !== null,
      );
      return {items, unreadable: records.length - items.length};
    },
    /** A new item, or a changed one (`id`): encrypted before it leaves. */
    save: async (
      vaultKey: VaultKey,
      item: VaultItem,
      id?: string,
    ): Promise<VaultItemRecord> => {
      const body = {data: await encryptItem(vaultKey, item)};
      return id
        ? api.put<VaultItemRecord>(`${BASE}/items/${id}`, body)
        : api.post<VaultItemRecord>(`${BASE}/items`, body);
    },
    remove: (id: string) => api.delete(`${BASE}/items/${id}`),
  };
}
