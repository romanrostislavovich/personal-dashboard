import { BackupFile, BackupProblem, RestoreCheck } from '@pd/contracts';
import { readdir, readFile, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

/** Daily dumps are named by their day (deploy/backup.sh), so names sort by age. */
export const DUMP_NAME = /^dashboard-\d{4}-\d{2}-\d{2}\.dump$/;
/** Written by deploy/backup.sh after the weekly test restore. */
const RESTORE_CHECK_FILE = 'restore-check.json';
/** Every pg_dump custom-format file starts with this. */
export const DUMP_MAGIC = 'PGDMP';

const HOUR = 3_600_000;
/** A daily dump, with some slack for a slow one. */
const SERVER_STALE_HOURS = 26;
/** The computer is not always on: a copy a few days old is normal. */
const CLIENT_STALE_HOURS = 24 * 4;
/** The test restore runs weekly. */
const CHECK_STALE_HOURS = 24 * 8;

/** The dumps in a folder, newest first; a missing folder has none. */
export async function listDumps(folder: string): Promise<BackupFile[]> {
  let names: string[];
  try {
    names = await readdir(folder);
  } catch {
    return [];
  }
  const dumps = names
    .filter((name) => DUMP_NAME.test(name))
    .sort()
    .reverse();
  return Promise.all(
    dumps.map(async (name) => {
      const info = await stat(join(folder, name));
      return { name, size: info.size, createdAt: info.mtime.toISOString() };
    }),
  );
}

/** Deletes all but the newest `keep` dumps. */
export async function pruneDumps(folder: string, keep: number): Promise<void> {
  for (const dump of (await listDumps(folder)).slice(keep)) {
    await unlink(join(folder, dump.name));
  }
}

export async function readRestoreCheck(folder: string): Promise<RestoreCheck | null> {
  try {
    return JSON.parse(await readFile(join(folder, RESTORE_CHECK_FILE), 'utf8')) as RestoreCheck;
  } catch {
    return null;
  }
}

/** What is wrong with the backups of an instance, if anything. */
export function backupProblems(
  side: 'server' | 'client',
  latest: BackupFile | null,
  check: RestoreCheck | null,
  now = new Date(),
): BackupProblem[] {
  const hoursSince = (time: string) => (now.getTime() - new Date(time).getTime()) / HOUR;
  const problems: BackupProblem[] = [];
  const staleAfter = side === 'server' ? SERVER_STALE_HOURS : CLIENT_STALE_HOURS;
  if (!latest) {
    problems.push('missing');
  } else if (hoursSince(latest.createdAt) > staleAfter) {
    problems.push('stale');
  }
  if (check && !check.ok) {
    problems.push('restore-failed');
  } else if (side === 'server' && (!check || hoursSince(check.checkedAt) > CHECK_STALE_HOURS)) {
    // Only the server runs the check; the client merely repeats what the server said.
    problems.push('unchecked');
  }
  return problems;
}
