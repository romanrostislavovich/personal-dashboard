import {
  mkdir,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import {join} from 'node:path';

/**
 * The copies of one's data kept on this computer: the archive the dashboard exports
 * (Settings → Data), saved once a day by the page. They outlive the server — a server gone or
 * not paid for — and come back through "Import" into any dashboard.
 */

/** `personal-dashboard-2026-10-14.zip`: one a day, and nothing else is read or removed. */
const COPY_NAME = /^personal-dashboard-\d{4}-\d{2}-\d{2}\.zip$/;

export interface BackupCopy {
  name: string;
  size: number;
  /** When it was saved, ISO. */
  savedAt: string;
}

export interface BackupStatus {
  folder: string;
  /** How many copies are kept; older ones are removed. */
  keep: number;
  /** The newest first. */
  copies: BackupCopy[];
}

function isCopyName(name: string): boolean {
  return COPY_NAME.test(name);
}

export async function listCopies(folder: string): Promise<BackupCopy[]> {
  const names = await readdir(folder).catch(() => [] as string[]);
  const copies = await Promise.all(
    names.filter(isCopyName).map(async name => {
      const info = await stat(join(folder, name));
      return {name, size: info.size, savedAt: info.mtime.toISOString()};
    }),
  );
  return copies.sort((a, b) => b.name.localeCompare(a.name));
}

/**
 * Saves a copy (the day's one is replaced) through a `.part` file, so a broken write never
 * looks like a copy, and removes the oldest beyond `keep`.
 */
export async function saveCopy(
  folder: string,
  name: string,
  data: Uint8Array,
  keep: number,
): Promise<void> {
  if (!isCopyName(name)) {
    throw new Error(`Not a name of a copy: ${name}`);
  }
  await mkdir(folder, {recursive: true});
  const target = join(folder, name);
  const part = `${target}.part`;
  try {
    await writeFile(part, data);
    await rename(part, target);
  } finally {
    await unlink(part).catch(() => undefined);
  }
  const copies = await listCopies(folder);
  for (const old of copies.slice(Math.max(keep, 1))) {
    await unlink(join(folder, old.name)).catch(() => undefined);
  }
}
