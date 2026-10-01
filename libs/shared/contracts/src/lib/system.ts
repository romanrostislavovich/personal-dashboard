export const SYSTEM_LOG_LEVELS = ['error', 'warn'] as const;
export type SystemLogLevel = (typeof SYSTEM_LOG_LEVELS)[number];

/** A background job and how its last runs went. */
export interface SystemJob {
  /** `<module>.<job>`, as registered in the scheduler. */
  name: string;
  cron: string;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastDurationMs: number | null;
  /** Failed runs in a row; 0 — the last run went well. */
  failures: number;
  lastError: string | null;
  lastErrorAt: string | null;
}

/** An error or a warning of the server; the same one repeated within a day is one entry. */
export interface SystemLogEntry {
  id: string;
  level: SystemLogLevel;
  /** Which part of the server wrote it (a service or a job). */
  source: string;
  message: string;
  /** The stack trace, if there was one. */
  details: string | null;
  /** How many times it happened between `firstAt` and `lastAt`. */
  count: number;
  firstAt: string;
  lastAt: string;
}

/** `GET /api/system/status`: how the instance that answers is doing. Only for the owner. */
export interface SystemStatus {
  /** `false` on a sync client: background jobs run on the server, open its settings for them. */
  jobsRunHere: boolean;
  jobs: SystemJob[];
  /** Newest first. */
  log: SystemLogEntry[];
}
