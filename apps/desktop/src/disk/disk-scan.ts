import { promises as fs, statfsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, parse, relative, sep } from 'node:path';

/** What the scan found (DiskReport in contracts), with the real paths the app acts on. */
export interface DiskReport {
  mount: string;
  total: number;
  free: number;
  folders: { path: string; bytes: number; files: number; modifiedAt: string | null }[];
  files: { path: string; bytes: number; modifiedAt: string | null }[];
  known: { place: string; path: string; bytes: number }[];
}

export interface ScanProgress {
  files: number;
  bytes: number;
}

/** Folders this deep or less are measured on their own (deeper ones add to their parents). */
const MAX_DEPTH = 6;
const CONCURRENCY = 32;
const GB = 1024 ** 3;
const MB = 1024 ** 2;
const MAX_FOLDERS = 150;
const MAX_FILES = 40;

interface FolderStats {
  bytes: number;
  files: number;
  modified: number;
}

/**
 * Walks a whole disk, read-only: the size and file count of every folder down to a few levels,
 * the biggest files, and the places known to grow (caches, temp, WSL, Docker…). Links and
 * folders that cannot be read are skipped. About a minute and a half for 200 GB.
 */
export async function scanDisk(
  mount: string,
  onProgress: (progress: ScanProgress) => void,
): Promise<DiskReport> {
  const root = mount.endsWith(sep) ? mount : mount + sep;
  const folders = new Map<string, FolderStats>();
  const bigFiles: { path: string; bytes: number; modified: number }[] = [];
  const progress: ScanProgress = { files: 0, bytes: 0 };
  let reported = Date.now();

  const add = (file: string, bytes: number, modified: number) => {
    const parts = relative(root, file).split(sep);
    // Every folder above the file, up to MAX_DEPTH levels from the root.
    for (let depth = 1; depth <= Math.min(parts.length - 1, MAX_DEPTH); depth++) {
      const folder = join(root, ...parts.slice(0, depth));
      const stats = folders.get(folder) ?? { bytes: 0, files: 0, modified: 0 };
      stats.bytes += bytes;
      stats.files++;
      stats.modified = Math.max(stats.modified, modified);
      folders.set(folder, stats);
    }
    if (bytes >= 100 * MB) {
      bigFiles.push({ path: file, bytes, modified });
    }
  };

  const queue = [root];
  const worker = async () => {
    while (queue.length) {
      const dir = queue.pop() as string;
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue; // No access: system folders of other users.
      }
      await Promise.all(
        entries.map(async (entry) => {
          const path = join(dir, entry.name);
          if (entry.isSymbolicLink()) {
            return;
          }
          if (entry.isDirectory()) {
            queue.push(path);
            return;
          }
          try {
            const stats = await fs.lstat(path);
            add(path, stats.size, stats.mtimeMs);
            progress.files++;
            progress.bytes += stats.size;
          } catch {
            // Locked or gone meanwhile.
          }
        }),
      );
      if (Date.now() - reported > 500) {
        reported = Date.now();
        onProgress({ ...progress });
      }
    }
  };
  await worker();
  while (queue.length) {
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  }
  onProgress({ ...progress });

  const space = statfsSync(root);
  const iso = (ms: number) => (ms ? new Date(ms).toISOString() : null);
  return {
    mount: parse(root).root.replace(/[\\/]$/, ''),
    total: space.blocks * space.bsize,
    free: space.bavail * space.bsize,
    folders: [...folders]
      .filter(([path, stats]) => stats.bytes >= (depthOf(root, path) <= 3 ? GB : 500 * MB))
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .slice(0, MAX_FOLDERS)
      .map(([path, stats]) => ({
        path,
        bytes: stats.bytes,
        files: stats.files,
        modifiedAt: iso(stats.modified),
      })),
    files: bigFiles
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, MAX_FILES)
      .map((file) => ({ path: file.path, bytes: file.bytes, modifiedAt: iso(file.modified) })),
    known: await measureKnown(root, folders),
  };
}

function depthOf(root: string, path: string): number {
  return relative(root, path).split(sep).length;
}

/** The places known to grow, on this disk: their size from the scan, or measured now. */
async function measureKnown(
  root: string,
  folders: Map<string, FolderStats>,
): Promise<DiskReport['known']> {
  const home = homedir();
  const local = process.env['LOCALAPPDATA'] ?? join(home, 'AppData', 'Local');
  const temp = process.env['TEMP'] ?? join(local, 'Temp');
  const places: [string, string][] = [
    ['temp', temp],
    ['browser-cache', join(local, 'Google', 'Chrome', 'User Data', 'Default', 'Cache')],
    ['browser-cache', join(local, 'Google', 'Chrome', 'User Data', 'Default', 'Code Cache')],
    ['browser-cache', join(local, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache')],
    ['browser-cache', join(local, 'Yandex', 'YandexBrowser', 'User Data', 'Default', 'Cache')],
    ['spotify-cache', join(local, 'Spotify', 'Data')],
    ['npm-cache', join(local, 'npm-cache')],
    ['yarn-cache', join(local, 'Yarn', 'Cache')],
    ['pip-cache', join(local, 'pip', 'Cache')],
    ['nuget-cache', join(home, '.nuget', 'packages')],
    ['gradle-cache', join(home, '.gradle', 'caches')],
    ['maven-repository', join(home, '.m2', 'repository')],
    ['jetbrains-caches', join(local, 'JetBrains')],
    ['crash-dumps', join(local, 'CrashDumps')],
    ['docker-data', join(local, 'Docker', 'wsl')],
    // WSL keeps the disks of newer distributions here.
    ['wsl-disk', join(local, 'wsl')],
    ['windows-old', join(root, 'Windows.old')],
    ['windows-update-cache', join(root, 'Windows', 'SoftwareDistribution', 'Download')],
    ['recycle-bin', join(root, '$Recycle.Bin')],
    ['downloads', join(home, 'Downloads')],
  ];
  // WSL distributions keep their whole disk in one file under Packages.
  const packages = join(local, 'Packages');
  try {
    for (const entry of await fs.readdir(packages, { withFileTypes: true })) {
      if (entry.isDirectory() && /Canonical|Debian|SUSE|Kali|Ubuntu/i.test(entry.name)) {
        places.push(['wsl-disk', join(packages, entry.name, 'LocalState')]);
      }
    }
  } catch {
    // No WSL.
  }

  const lower = root.toLowerCase();
  const found: DiskReport['known'] = [];
  for (const [place, path] of places) {
    if (!path.toLowerCase().startsWith(lower)) {
      continue; // On another disk.
    }
    const bytes = folders.get(path)?.bytes ?? (await folderSize(path));
    if (bytes > 50 * MB) {
      found.push({ place, path, bytes });
    }
  }
  return found;
}

/** The size of a folder deeper than the scan measures on its own. */
async function folderSize(path: string): Promise<number> {
  let total = 0;
  const queue = [path];
  while (queue.length) {
    const dir = queue.pop() as string;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        queue.push(full);
      } else if (entry.isFile()) {
        total += (await fs.lstat(full).catch(() => null))?.size ?? 0;
      }
    }
  }
  return total;
}
