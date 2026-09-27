import { createHash, timingSafeEqual } from 'node:crypto';
import { IncomingMessage } from 'node:http';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';

/**
 * Sync requests and responses are gzipped JSON with their own content type: the global JSON
 * body parser (100 KB limit) leaves them alone, and diary photos fit in one request.
 */
export const SYNC_CONTENT_TYPE = 'application/x-pd-sync+gzip';
/** Compressed request size limit. */
const MAX_BODY_BYTES = 64 * 1024 * 1024;

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export async function encodeSyncBody(value: unknown): Promise<Buffer> {
  return gzipAsync(Buffer.from(JSON.stringify(value), 'utf8'));
}

export async function decodeSyncBody(data: Buffer): Promise<unknown> {
  return JSON.parse((await gunzipAsync(data)).toString('utf8'));
}

/** Reads the raw request body (it is not parsed by Nest for our content type). */
export async function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) {
      throw new Error('Sync request is too large');
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** Constant-time comparison of `Authorization: Bearer <token>` with SYNC_TOKEN. */
export function isValidSyncToken(header: string | undefined, token: string): boolean {
  const given = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  const hash = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(given), hash(token));
}

/**
 * A fingerprint of ENCRYPTION_KEY. Secrets (API tokens) are synced encrypted, so both instances
 * must use the same key; the key itself never leaves the instance.
 */
export function encryptionKeyCheck(encryptionKey: string): string {
  return createHash('sha256').update(`pd-sync:${encryptionKey}`).digest('hex').slice(0, 16);
}
