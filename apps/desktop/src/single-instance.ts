import { app } from 'electron';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

/**
 * One copy of the app, and never as administrator.
 *
 * Electron's own lock does not see across the administrator boundary on Windows: a copy started
 * elevated (by the installer at its end) and a normal one each thought they were alone, and the
 * tray had two icons (2026-10-22…26). The app needs no administrator rights, and with them a bug
 * or a hacked server (the code updates itself from it) would own the whole computer — so an
 * elevated copy starts itself again as the signed-in user and goes. A file with the process id is
 * the second guard, for whatever else gets past Electron's lock.
 */

/**
 * A Windows program by its full path: a PATH with Git for Windows first has a `whoami` of its own,
 * which knows no `/groups`.
 */
const windowsTool = (...path: string[]) =>
  join(process.env['SystemRoot'] ?? 'C:\\Windows', ...path);

/** Windows integrity levels "High" and "System" (`whoami /groups`): run as administrator. */
const ELEVATED_LEVELS = ['S-1-16-12288', 'S-1-16-16384'];

/** Whether this process runs as administrator (Windows only; false where that cannot be told). */
export function isElevated(): boolean {
  if (process.platform !== 'win32') {
    return false;
  }
  try {
    const groups = execFileSync(windowsTool('System32', 'whoami.exe'), ['/groups'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    return ELEVATED_LEVELS.some((level) => groups.includes(level));
  } catch {
    return false;
  }
}

/**
 * Starts the installed app again without administrator rights: Explorer opens it, and Explorer
 * runs as the signed-in user. A copy that already runs then just shows its window.
 */
export function relaunchAsUser(): void {
  spawn(windowsTool('explorer.exe'), [process.execPath], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

/** Whether `tasklist` output (CSV, no header) lists the process `pid` of the program `exe`. */
export function listsProcess(tasklist: string, pid: number, exe: string): boolean {
  return tasklist
    .split(/\r?\n/)
    .some((line) => line.toLowerCase().startsWith(`"${exe.toLowerCase()}","${pid}"`));
}

/** Whether the process `pid` is a running copy of this program (a reused id is someone else). */
function isOurProcess(pid: number): boolean {
  if (process.platform !== 'win32') {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
  }
  try {
    const tasklist = execFileSync(
      windowsTool('System32', 'tasklist.exe'),
      ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
      {
        encoding: 'utf8',
        windowsHide: true,
      },
    );
    return listsProcess(tasklist, pid, basename(process.execPath));
  } catch {
    return false; // Cannot tell: better two copies than none.
  }
}

const lockFile = () => join(app.getPath('userData'), 'instance.pid');

/**
 * Takes the file lock: false when another live copy holds it. The file goes when this copy quits;
 * one left by a crash names a dead process and is taken over.
 */
export function claimInstanceFile(): boolean {
  try {
    const holder = Number(readFileSync(lockFile(), 'utf8'));
    if (holder && holder !== process.pid && isOurProcess(holder)) {
      return false;
    }
  } catch {
    // No file yet.
  }
  try {
    writeFileSync(lockFile(), String(process.pid));
    app.on('will-quit', releaseInstanceFile);
  } catch {
    // A read-only profile must not keep the app from starting.
  }
  return true;
}

function releaseInstanceFile(): void {
  try {
    if (Number(readFileSync(lockFile(), 'utf8')) === process.pid) {
      rmSync(lockFile());
    }
  } catch {
    // Already gone.
  }
}
