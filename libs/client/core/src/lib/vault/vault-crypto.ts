import { VAULT_KDF_ITERATIONS, VaultItem, VaultKeys } from '@pd/contracts';

/*
 * The cryptography of the password vault, on the device only (WebCrypto: the browser, the
 * extension, Node for tests). The server sees ciphertext and never a key.
 *
 * - A random 256-bit **vault key** encrypts every item (AES-256-GCM, a fresh IV each time).
 * - It is kept on the server **wrapped** twice: by a key derived from the **master password**
 *   (PBKDF2-SHA256, VAULT_KDF_ITERATIONS rounds, a random salt), and by the **recovery key** —
 *   256 random bits shown once, like 1Password's Emergency Kit.
 * - A wrong password fails the authenticated decryption of the wrapped key: that is the check.
 * - Changing the master password wraps the same vault key again: the items stay as they are.
 */

const AES = 'AES-GCM';
const IV_BYTES = 12;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

/** An open vault: the key that encrypts the items, kept in memory while it is unlocked. */
export interface VaultKey {
  /** For the items. */
  key: CryptoKey;
  /** For wrapping it again with a new master password. */
  raw: Uint8Array;
}

/** A new vault: what goes to the server, the recovery key to show once, and the open key. */
export interface NewVault {
  keys: VaultKeys;
  recoveryKey: string;
  vaultKey: VaultKey;
}

export class WrongVaultPasswordError extends Error {
  constructor() {
    super('The master password or the recovery key is wrong');
  }
}

const subtle = () => globalThis.crypto.subtle;

export async function createVault(
  masterPassword: string,
  iterations = VAULT_KDF_ITERATIONS,
): Promise<NewVault> {
  const raw = randomBytes(KEY_BYTES);
  const recovery = randomBytes(KEY_BYTES);
  const salt = randomBytes(SALT_BYTES);
  const keys: VaultKeys = {
    kdf: 'pbkdf2-sha256',
    iterations,
    salt: toBase64(salt),
    wrappedByPassword: toBase64(
      await seal(await passwordKey(masterPassword, salt, iterations), raw),
    ),
    wrappedByRecovery: toBase64(await seal(await importAes(recovery), raw)),
  };
  return { keys, recoveryKey: formatRecoveryKey(recovery), vaultKey: await openKey(raw) };
}

export async function unlockVault(keys: VaultKeys, masterPassword: string): Promise<VaultKey> {
  const key = await passwordKey(masterPassword, fromBase64(keys.salt), keys.iterations);
  return openKey(await unseal(key, fromBase64(keys.wrappedByPassword)));
}

export async function unlockWithRecoveryKey(
  keys: VaultKeys,
  recoveryKey: string,
): Promise<VaultKey> {
  const recovery = parseRecoveryKey(recoveryKey);
  if (!recovery) {
    throw new WrongVaultPasswordError();
  }
  return openKey(await unseal(await importAes(recovery), fromBase64(keys.wrappedByRecovery)));
}

/** A new master password for an open vault: a new salt, the same vault and recovery keys. */
export async function rewrapVault(
  keys: VaultKeys,
  vaultKey: VaultKey,
  masterPassword: string,
  iterations = keys.iterations,
): Promise<VaultKeys> {
  const salt = randomBytes(SALT_BYTES);
  return {
    ...keys,
    iterations,
    salt: toBase64(salt),
    wrappedByPassword: toBase64(
      await seal(await passwordKey(masterPassword, salt, iterations), vaultKey.raw),
    ),
  };
}

/**
 * The open vault again from its raw bytes — for a client whose process does not live as long as
 * the unlocked vault (the extension's service worker sleeps after 30 seconds and keeps the bytes
 * in the browser's memory meanwhile). Never from anything written to disk.
 */
export function restoreVaultKey(raw: Uint8Array): Promise<VaultKey> {
  return openKey(raw);
}

export async function encryptItem(vaultKey: VaultKey, item: VaultItem): Promise<string> {
  const plain = new TextEncoder().encode(JSON.stringify(item));
  return toBase64(await seal(vaultKey.key, plain));
}

export async function decryptItem(vaultKey: VaultKey, data: string): Promise<VaultItem> {
  const plain = await unseal(vaultKey.key, fromBase64(data));
  return JSON.parse(new TextDecoder().decode(plain)) as VaultItem;
}

// --- The recovery key: 52 characters of base32, in groups, easy to write down ---

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** `PDRK-XXXXX-…`: base32 of the 32 bytes, in groups of five. */
export function formatRecoveryKey(bytes: Uint8Array): string {
  let bits = '';
  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let text = '';
  for (let i = 0; i < bits.length; i += 5) {
    text += BASE32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  }
  return `PDRK-${text.match(/.{1,5}/g)?.join('-')}`;
}

/** The bytes of a recovery key as written (any case, dashes and spaces left out); `null` — not one. */
export function parseRecoveryKey(text: string): Uint8Array | null {
  const clean = text.toUpperCase().replace(/^PDRK/, '').replace(/[\s-]/g, '');
  if (
    clean.length !== Math.ceil((KEY_BYTES * 8) / 5) ||
    [...clean].some((c) => !BASE32.includes(c))
  ) {
    return null;
  }
  const bits = [...clean].map((c) => BASE32.indexOf(c).toString(2).padStart(5, '0')).join('');
  const bytes = new Uint8Array(KEY_BYTES);
  for (let i = 0; i < KEY_BYTES; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

// --- The pieces ---

async function passwordKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await subtle().importKey(
    'raw',
    new TextEncoder().encode(password.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: buffer(salt), iterations },
    material,
    { name: AES, length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function importAes(raw: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey('raw', buffer(raw), { name: AES }, false, ['encrypt', 'decrypt']);
}

async function openKey(raw: Uint8Array): Promise<VaultKey> {
  return { key: await importAes(raw), raw };
}

/** iv · ciphertext with its tag */
async function seal(key: CryptoKey, plain: Uint8Array): Promise<Uint8Array> {
  const iv = randomBytes(IV_BYTES);
  const sealed = new Uint8Array(
    await subtle().encrypt({ name: AES, iv: buffer(iv) }, key, buffer(plain)),
  );
  const out = new Uint8Array(IV_BYTES + sealed.length);
  out.set(iv);
  out.set(sealed, IV_BYTES);
  return out;
}

async function unseal(key: CryptoKey, sealed: Uint8Array): Promise<Uint8Array> {
  try {
    return new Uint8Array(
      await subtle().decrypt(
        { name: AES, iv: buffer(sealed.subarray(0, IV_BYTES)) },
        key,
        buffer(sealed.subarray(IV_BYTES)),
      ),
    );
  } catch {
    // The tag does not match: the wrong key, or the data was changed.
    throw new WrongVaultPasswordError();
  }
}

export function randomBytes(length: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

/** A copy in an ArrayBuffer of its own: what WebCrypto takes in every environment. */
function buffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
