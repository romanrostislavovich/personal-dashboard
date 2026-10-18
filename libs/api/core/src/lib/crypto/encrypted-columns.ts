import { toSnakeCase } from 'drizzle-orm/casing';
import { customType, getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Columns stored encrypted (the diagnoses of Health, its scans): AES-256-GCM with a key derived
 * from `ENCRYPTION_KEY`. A module declares them with `encryptedText()` / `encryptedBytes()` and
 * reads and writes plain values through Drizzle; a dump or a backup holds only ciphertext.
 *
 * Whatever copies rows as they are — sync, the trash — carries the ciphertext, so both sides of
 * sync need the same key. The export of one's data decrypts them, and an import encrypts them
 * again with this instance's key (`registerEncryptedTables`).
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** What marks an encrypted value: a value without it is read as it is (written before). */
const TEXT_PREFIX = 'enc:v1:';
const BYTES_MAGIC = Buffer.from('PDENC1');

let key: Buffer | null = null;
let hashKey: Buffer | null = null;

/** Called once on start; a key of its own, apart from the one of SecretsService. */
export function configureFieldEncryption(secret: string): void {
  key = Buffer.from(hkdfSync('sha256', secret, 'personal-dashboard', 'encrypted-columns.v1', 32));
  hashKey = Buffer.from(hkdfSync('sha256', secret, 'personal-dashboard', 'keyed-hash.v1', 32));
}

/**
 * A fingerprint of a secret text to compare by (the same notification twice): HMAC-SHA256, so a
 * dump does not let anyone guess a short text by hashing candidates.
 */
export function keyedHash(text: string): string {
  if (!hashKey) {
    throw new Error('keyedHash() is used before configureFieldEncryption()');
  }
  return createHmac('sha256', hashKey).update(text).digest('base64url');
}

function requireKey(): Buffer {
  if (!key) {
    throw new Error('Encrypted columns are used before configureFieldEncryption()');
  }
  return key;
}

/** iv · tag · ciphertext */
function seal(plain: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, requireKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

function open(sealed: Buffer): Buffer {
  const iv = sealed.subarray(0, IV_BYTES);
  const tag = sealed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, requireKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
}

export const isEncryptedText = (value: string) => value.startsWith(TEXT_PREFIX);

const isEncryptedBytes = (value: Buffer) =>
  value.subarray(0, BYTES_MAGIC.length).equals(BYTES_MAGIC);

export function encryptText(plain: string): string {
  return isEncryptedText(plain)
    ? plain
    : TEXT_PREFIX + seal(Buffer.from(plain, 'utf8')).toString('base64');
}

export function decryptText(stored: string): string {
  return isEncryptedText(stored)
    ? open(Buffer.from(stored.slice(TEXT_PREFIX.length), 'base64')).toString('utf8')
    : stored;
}

export function encryptBytes(plain: Buffer): Buffer {
  return isEncryptedBytes(plain) ? plain : Buffer.concat([BYTES_MAGIC, seal(plain)]);
}

export function decryptBytes(stored: Buffer): Buffer {
  return isEncryptedBytes(stored) ? open(stored.subarray(BYTES_MAGIC.length)) : stored;
}

/** Text stored encrypted; it cannot be searched or sorted by the database. */
export const encryptedText = customType<{ data: string; driverData: string }>({
  dataType: () => 'text',
  toDriver: encryptText,
  fromDriver: decryptText,
});

/** A file (a scan, a PDF) stored encrypted. */
export const encryptedBytes = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
  toDriver: encryptBytes,
  fromDriver: decryptBytes,
});

export interface EncryptedColumns {
  text: ReadonlySet<string>;
  bytes: ReadonlySet<string>;
}

/** Table name → its encrypted columns, as the database names them. */
const registry = new Map<string, EncryptedColumns>();

/**
 * Tells the export and the import which columns of these tables are encrypted; a module calls
 * it in its `*.schema.ts` for every table with `encryptedText()` / `encryptedBytes()`.
 */
export function registerEncryptedTables(...tables: PgTable[]): void {
  for (const table of tables) {
    const config = getTableConfig(table);
    const named = (mapper: unknown) =>
      new Set(
        config.columns
          .filter((column) => (column as { mapTo?: unknown }).mapTo === mapper)
          .map((column) => (column.keyAsName ? toSnakeCase(column.name) : column.name)),
      );
    registry.set(config.name, { text: named(encryptText), bytes: named(encryptBytes) });
  }
}

export function encryptedColumnsOf(table: string): EncryptedColumns | undefined {
  return registry.get(table);
}

/** A row as the database holds it, with its encrypted text columns read (the export). */
export function decryptedRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  return mapText(table, row, decryptText);
}

/** A row of an archive, with its encrypted text columns sealed with this key (the import). */
export function encryptedRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  return mapText(table, row, encryptText);
}

function mapText(
  table: string,
  row: Record<string, unknown>,
  map: (value: string) => string,
): Record<string, unknown> {
  const columns = registry.get(table)?.text;
  if (!columns?.size) {
    return row;
  }
  const result = { ...row };
  for (const column of columns) {
    const value = result[column];
    if (typeof value === 'string') {
      result[column] = map(value);
    }
  }
  return result;
}
