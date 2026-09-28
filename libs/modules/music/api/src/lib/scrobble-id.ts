import { createHash } from 'node:crypto';

/** A fixed namespace for scrobble ids (a random UUID, chosen once). */
const NAMESPACE = Buffer.from('6f1c2a9e4b7d4e0f9a3b5c8d2e1f7a64', 'hex');

/**
 * The same play always gets the same id (a UUID v5 of user, time and track).
 * The server and a local instance may both import the same Last.fm history; with equal ids
 * sync merges the rows instead of reporting thousands of conflicts (see docs/sync.md).
 */
export function scrobbleId(userId: string, playedAt: Date, track: string): string {
  const hash = createHash('sha1')
    .update(NAMESPACE)
    .update(`${userId}|${playedAt.toISOString()}|${track}`)
    .digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
