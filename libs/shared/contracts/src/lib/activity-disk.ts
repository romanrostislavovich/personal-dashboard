import { z } from 'zod';

// Disk cleanup advice: the desktop app scans a disk, the server (with the AI) says what can go.

/** Places known to grow and how to deal with them; the app measures each one it finds. */
export const DISK_KNOWN_PLACES = [
  'temp',
  'browser-cache',
  'spotify-cache',
  'npm-cache',
  'yarn-cache',
  'pip-cache',
  'nuget-cache',
  'gradle-cache',
  'maven-repository',
  'jetbrains-caches',
  'crash-dumps',
  'docker-data',
  'wsl-disk',
  'windows-old',
  'windows-update-cache',
  'recycle-bin',
  'downloads',
] as const;
export type DiskKnownPlace = (typeof DISK_KNOWN_PLACES)[number];

const diskPath = z.string().min(1).max(500);
const bytes = z.number().int().min(0);

/**
 * What the app found, as the AI may see it: paths and sizes, no contents. The user's profile
 * folder is written as `%USERPROFILE%`.
 */
export const diskReportSchema = z.object({
  mount: z.string().min(1).max(20),
  total: bytes,
  free: bytes,
  /** The biggest folders, nested ones included. */
  folders: z
    .array(
      z.object({
        path: diskPath,
        bytes,
        files: z.number().int().min(0),
        modifiedAt: z.iso.datetime({ offset: true }).nullable(),
      }),
    )
    .max(200),
  /** The biggest single files. */
  files: z
    .array(
      z.object({ path: diskPath, bytes, modifiedAt: z.iso.datetime({ offset: true }).nullable() }),
    )
    .max(60),
  known: z.array(z.object({ place: z.enum(DISK_KNOWN_PLACES), path: diskPath, bytes })).max(60),
  /** The other disks of the computer: where a big program or game could move. */
  otherDisks: z
    .array(z.object({ mount: z.string().min(1).max(20), total: bytes, free: bytes }))
    .max(30)
    .optional(),
});
export type DiskReport = z.infer<typeof diskReportSchema>;

/**
 * - `trash` — the app can move it to the Recycle Bin;
 * - `command` — a command of the program that owns it frees the space better (`docker system prune`);
 * - `tool` — a tool of Windows does it (Disk Cleanup, Settings → Storage);
 * - `review` — worth a look by the user: only they know whether it is needed.
 */
export type DiskAction = 'trash' | 'command' | 'tool' | 'review';
/** `safe` — rebuilt by itself (caches); `check` — likely unneeded, but look first; `risky` — yours. */
export type DiskSafety = 'safe' | 'check' | 'risky';

/**
 * A cleanup the desktop app can do itself with a button — a command of its own, never text
 * from the AI: clear a package cache, prune Docker, open the storage settings of Windows.
 */
export const DISK_FIXES = [
  'npm-cache',
  'yarn-cache',
  'pip-cache',
  'nuget-cache',
  'docker-prune',
  'storage-settings',
] as const;
export type DiskFix = (typeof DISK_FIXES)[number];

export interface DiskSuggestion {
  path: string;
  bytes: number;
  action: DiskAction;
  safety: DiskSafety;
  reason: string;
  /** For `command` and `tool`: what to run or open. */
  how: string | null;
  /** The app can do it with a button. */
  fix: DiskFix | null;
}

export interface DiskAdvice {
  suggestions: DiskSuggestion[];
  /** A line or two about the disk as a whole. */
  summary: string;
  /** The AI wrote it; `false` — the built-in rules (no AI connected, or it failed). */
  byAi: boolean;
}
