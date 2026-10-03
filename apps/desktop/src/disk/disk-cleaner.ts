import { app, shell } from 'electron';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isProtected } from './disk-guard';
import { DiskReport, ScanProgress, scanDisk } from './disk-scan';

export type DiskScanStatus =
  | { state: 'idle' }
  | { state: 'scanning'; mount: string; progress: ScanProgress }
  /** The report as the AI may see it: the profile folder written as %USERPROFILE%. */
  | { state: 'done'; report: DiskReport }
  | { state: 'error'; message: string };

export interface TrashResult {
  path: string;
  ok: boolean;
  /** Why it stayed: protected, not in the report, gone, or Windows refused. */
  reason?: 'protected' | 'unknown' | 'missing' | 'failed';
}

const PROFILE = '%USERPROFILE%';

/**
 * Disk cleanup on this computer: a scan on request, and moving to the Recycle Bin what the user
 * picked from the advice. Only paths from the last report can go, and never a protected one
 * (disk-guard.ts) — the page, the server and the AI cannot ask for anything else.
 */
export class DiskCleaner {
  private status: DiskScanStatus = { state: 'idle' };
  /** Every path of the last report, as the page knows it → the real one. */
  private known = new Map<string, string>();
  /**
   * The known places (temp, caches): programs expect the folder itself to be there, so only
   * what is inside goes, and what is in use stays.
   */
  private containers = new Set<string>();

  current(): DiskScanStatus {
    return this.status;
  }

  scan(mount: string): void {
    if (this.status.state === 'scanning' || !/^[A-Za-z]:$/.test(mount)) {
      return;
    }
    this.status = { state: 'scanning', mount, progress: { files: 0, bytes: 0 } };
    scanDisk(mount, (progress) => {
      if (this.status.state === 'scanning') {
        this.status = { ...this.status, progress };
      }
    })
      .then((report) => {
        this.known = new Map(
          [...report.folders, ...report.files, ...report.known].map((item) => [
            hideProfile(item.path),
            item.path,
          ]),
        );
        this.containers = new Set(report.known.map((place) => place.path));
        this.status = { state: 'done', report: withHiddenProfile(report) };
      })
      .catch((error: Error) => (this.status = { state: 'error', message: error.message }));
  }

  /** Moves the picked paths to the Recycle Bin, one by one; the rest of the list goes on. */
  async trash(paths: string[]): Promise<TrashResult[]> {
    const ownFolders = [app.getAppPath(), app.getPath('userData'), process.resourcesPath];
    const results: TrashResult[] = [];
    for (const path of paths) {
      const real = this.known.get(path);
      if (!real) {
        results.push({ path, ok: false, reason: 'unknown' });
      } else if (isProtected(real, ownFolders)) {
        results.push({ path, ok: false, reason: 'protected' });
      } else if (!existsSync(real)) {
        results.push({ path, ok: false, reason: 'missing' });
      } else if (this.containers.has(real)) {
        const moved = await trashContents(real);
        results.push(moved ? { path, ok: true } : { path, ok: false, reason: 'failed' });
      } else {
        try {
          await shell.trashItem(real);
          results.push({ path, ok: true });
        } catch {
          results.push({ path, ok: false, reason: 'failed' });
        }
      }
    }
    return results;
  }

  /** The Recycle Bin of Windows: emptying it is the user's own step. */
  openRecycleBin(): void {
    void shell.openExternal('shell:RecycleBinFolder');
  }
}

/** Moves what is inside a folder to the Recycle Bin; whatever is in use stays. */
async function trashContents(folder: string): Promise<number> {
  let moved = 0;
  for (const name of readdirSync(folder)) {
    try {
      await shell.trashItem(join(folder, name));
      moved++;
    } catch {
      // In use by a running program: it stays.
    }
  }
  return moved;
}

function hideProfile(path: string): string {
  const home = homedir();
  return path.toLowerCase().startsWith(home.toLowerCase())
    ? PROFILE + path.slice(home.length)
    : path;
}

function withHiddenProfile(report: DiskReport): DiskReport {
  return {
    ...report,
    folders: report.folders.map((item) => ({ ...item, path: hideProfile(item.path) })),
    files: report.files.map((item) => ({ ...item, path: hideProfile(item.path) })),
    known: report.known.map((item) => ({ ...item, path: hideProfile(item.path) })),
  };
}
