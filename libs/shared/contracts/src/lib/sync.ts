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

/**
 * A module action the client asks the server to run for a user: anything that reaches outside
 * services runs on the server only (see ServerActions in the core).
 */
export const syncActionRequestSchema = z.object({
  ...handshake,
  userId: z.uuid(),
  /** `<module>.<action>`, e.g. `music.lastfm-sync`. */
  action: z.string().regex(/^[a-z0-9-]+\.[a-z0-9-]+$/),
  args: z.record(z.string(), z.unknown()),
});
export type SyncActionRequest = z.infer<typeof syncActionRequestSchema>;

export interface SyncActionResponse {
  result: unknown;
}

/** Asks the server for its fingerprints (see `TableFingerprint`): only the handshake. */
export const syncFingerprintsRequestSchema = z.object(handshake);
export type SyncFingerprintsRequest = z.infer<typeof syncFingerprintsRequestSchema>;

/**
 * A table's contents in short: the row count and a hash of all rows. The client compares them
 * with the server's once in a while — equal hashes mean both sides hold the same data.
 */
export interface TableFingerprint {
  rows: number;
  hash: string;
}

export interface SyncFingerprintsResponse {
  tables: Record<string, TableFingerprint>;
}

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
  /** Client: the latest comparison of the data with the server's; `null` — not yet. */
  reconcile: ReconcileResult | null;
  /** Backups on this instance (server: the dumps, client: their copies); `null` — none. */
  backup: BackupStatus | null;
}

/** Tables whose data differs between the client and the server. */
export interface ReconcileResult {
  checkedAt: string;
  mismatches: ReconcileMismatch[];
}

export interface ReconcileMismatch {
  table: string;
  /** Row counts; equal counts with a mismatch mean the rows themselves differ. */
  localRows: number | null;
  serverRows: number | null;
}

/** A database dump. */
export interface BackupFile {
  name: string;
  size: number;
  createdAt: string;
}

/** The weekly test restore of a dump into a scratch database (deploy/backup.sh). */
export interface RestoreCheck {
  checkedAt: string;
  dump: string;
  ok: boolean;
  /** Why the restore failed. */
  error: string | null;
  tables: number;
  rows: number;
  /** Tables whose restored row count is off; `restored: -1` — the table is missing. */
  mismatches: { table: string; live: number; restored: number }[];
}

/**
 * - `missing` — no dump at all;
 * - `stale` — the newest dump (server) or copy (client) is too old;
 * - `unchecked` — no test restore for more than a week;
 * - `restore-failed` — the latest test restore failed or lost rows.
 */
export const BACKUP_PROBLEMS = ['missing', 'stale', 'unchecked', 'restore-failed'] as const;
export type BackupProblem = (typeof BACKUP_PROBLEMS)[number];

export interface BackupStatus {
  /** Server: the newest dump; client: the newest copy of one. */
  latest: BackupFile | null;
  count: number;
  /** Where they are: the server's folder or the client's copy folder. */
  folder: string;
  /** The server's latest test restore (the client learns it when copying). */
  restoreCheck: RestoreCheck | null;
  /** Client: why the last copy failed. */
  lastError: string | null;
  problems: BackupProblem[];
}

/** The server's newest dump, as the client asks for it before copying. */
export interface SyncBackupInfo {
  latest: BackupFile | null;
  restoreCheck: RestoreCheck | null;
}

/** A version of a row that lost a conflict, next to the row as it is now. */
export interface SyncConflict {
  id: string;
  table: string;
  reason: string;
  createdAt: string;
  /** The losing version. Binary values are replaced by a size note. */
  kept: Record<string, unknown>;
  /** The row as it is now; `null` — it no longer exists. */
  current: Record<string, unknown> | null;
}

/** An incoming change that waits for a row it depends on, or keeps failing. */
export interface SyncParkedChange {
  table: string;
  /** Primary key as a JSON object — identifies the change for "discard". */
  pk: string;
  error: string;
  parkedAt: string;
  /** `null` — a deletion. */
  row: Record<string, unknown> | null;
}

export const syncParkedKeySchema = z.object({
  table: z.string().regex(/^[a-z_][a-z0-9_]*$/),
  pk: z.string().max(1000),
});
export type SyncParkedKey = z.infer<typeof syncParkedKeySchema>;
