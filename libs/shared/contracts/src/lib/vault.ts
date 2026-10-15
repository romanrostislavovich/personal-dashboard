import { z } from 'zod';

/*
 * The password vault. Everything is encrypted on the device (the browser, the extension) with a
 * key the server never sees: the server keeps only ciphertext and the parameters to derive the
 * key from the master password. See libs/client/core/src/lib/vault/vault-crypto.ts.
 */

/** PBKDF2-SHA256 rounds: what OWASP recommends for it (2023). */
export const VAULT_KDF_ITERATIONS = 600_000;
/** An item is a few fields; a long secure note fits too. Base64 of the ciphertext. */
export const VAULT_ITEM_MAX_LENGTH = 256 * 1024;

const base64 = (max: number) =>
  z
    .string()
    .max(max)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/);

/**
 * How the vault key is reached: wrapped (encrypted) once by the key of the master password and
 * once by the recovery key. The server checks only the shape — it cannot open either.
 */
export const vaultKeysSchema = z.object({
  kdf: z.literal('pbkdf2-sha256'),
  iterations: z.number().int().min(100_000).max(10_000_000),
  /** Of the master password's key. */
  salt: base64(64),
  wrappedByPassword: base64(256),
  wrappedByRecovery: base64(256),
});
export type VaultKeys = z.infer<typeof vaultKeysSchema>;

/** `PUT /api/vault/keys` once the vault exists: the account password says it is the owner. */
export const vaultKeysChangeSchema = vaultKeysSchema.extend({
  accountPassword: z.string().min(1).max(200),
});
export type VaultKeysChange = z.infer<typeof vaultKeysChangeSchema>;

export interface VaultKeysState extends VaultKeys {
  updatedAt: string;
}

/** An item as the server keeps it: its id, its ciphertext and when it changed. */
export const vaultItemInputSchema = z.object({ data: base64(VAULT_ITEM_MAX_LENGTH) });
export type VaultItemInput = z.infer<typeof vaultItemInputSchema>;

export interface VaultItemRecord {
  id: string;
  data: string;
  createdAt: string;
  updatedAt: string;
}

// --- What an item holds, once decrypted on the device ---

export const VAULT_ITEM_KINDS = ['login', 'note'] as const;
export type VaultItemKind = (typeof VAULT_ITEM_KINDS)[number];

export interface VaultItem {
  kind: VaultItemKind;
  title: string;
  /** Addresses the login is for; the extension matches the page against them. */
  urls: string[];
  username: string;
  password: string;
  notes: string;
  /** Marked by the user: shown first. */
  favorite: boolean;
  /** Where it came from when imported (`1password`), for a second import. */
  source?: { app: string; id: string };
}

/** An item opened on the device: its record and what it holds. */
export interface OpenVaultItem extends VaultItem {
  id: string;
  createdAt: string;
  updatedAt: string;
}
