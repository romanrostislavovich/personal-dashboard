import { z } from 'zod';

/**
 * Two-way sync between two instances of the dashboard (see docs/sync.md):
 * - `off` — a single instance (default);
 * - `server` — the always-on instance: runs background jobs and the Telegram bot, accepts clients;
 * - `client` — the instance on your computer: works offline and syncs with the server regularly.
 */
export const SYNC_MODES = ['off', 'server', 'client'] as const;
export type SyncMode = (typeof SYNC_MODES)[number];

/**
 * One changed row. Values travel as JSON text straight from PostgreSQL, so nothing is lost
 * on the way (bigints, timestamps with microseconds).
 */
export const syncChangeSchema = z.object({
  table: z.string().regex(/^[a-z_][a-z0-9_]*$/),
  /** Primary key columns and values, JSON object. */
  pk: z.string(),
  /** When the row changed on the side it comes from (timestamptz as text). */
  changedAt: z.string(),
  /** The whole row as a JSON object; `null` — the row was deleted. */
  row: z.string().nullable(),
});
export type SyncChange = z.infer<typeof syncChangeSchema>;

/** Sent with every request: both sides must run the same schema and encryption key. */
const handshake = {
  /** Name of the client instance, for example the computer name. */
  peer: z.string().min(1).max(100),
  /** The latest applied migration. */
  schema: z.string(),
  /** A hash of ENCRYPTION_KEY: synced secrets can only be read with the same key. */
  keyCheck: z.string(),
};

export const syncPushRequestSchema = z.object({
  ...handshake,
  changes: z.array(syncChangeSchema).max(5_000),
});
export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;

export interface SyncPushResponse {
  applied: number;
  /** Older than what the server already has. */
  skipped: number;
  /** Waiting for rows they depend on (see docs/sync.md). */
  parked: number;
}

export const syncPullRequestSchema = z.object({
  ...handshake,
  /** Position in the server's change log; `null` — from the beginning. */
  cursor: z.string().nullable(),
});
export type SyncPullRequest = z.infer<typeof syncPullRequestSchema>;

export interface SyncPullResponse {
  /** Changes a new server database with its own positions — the client starts over. */
  serverId: string;
  changes: SyncChange[];
  cursor: string | null;
  hasMore: boolean;
}

export interface SyncStatus {
  mode: SyncMode;
  /** Client: the server address. */
  serverUrl: string | null;
  /** Client: the last successful sync; server: the last contact from a client. */
  lastSyncedAt: string | null;
  /** Client: why the last sync failed (for example, no internet). */
  lastError: string | null;
  /** Client: local changes not sent to the server yet. */
  pendingChanges: number;
  /** Changes waiting for rows they depend on. */
  parked: number;
  /** Versions that lost a conflict (kept in `sync.conflicts`). */
  conflicts: number;
}
