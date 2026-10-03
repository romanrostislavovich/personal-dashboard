import { shell } from 'electron';
import { execFile } from 'node:child_process';

/** The cleanups the app does with a button (DISK_FIXES in contracts). */
export type DiskFix =
  'npm-cache' | 'yarn-cache' | 'pip-cache' | 'nuget-cache' | 'docker-prune' | 'storage-settings';

export interface FixResult {
  ok: boolean;
  /** The end of what the command printed: how much it freed, or why it failed. */
  output: string;
}

/** Docker may take a while to remove images; a package cache is quick. */
const TIMEOUT_MS = 10 * 60_000;

/**
 * The commands behind the buttons — fixed here, never taken from the advice or the page:
 * the page names a fix, the app runs its own command for it. npm, yarn and pip are batch
 * files on Windows, hence `cmd /c`.
 */
const COMMANDS: Record<Exclude<DiskFix, 'storage-settings'>, [string, string[]]> = {
  'npm-cache': ['cmd.exe', ['/d', '/c', 'npm', 'cache', 'clean', '--force']],
  'yarn-cache': ['cmd.exe', ['/d', '/c', 'yarn', 'cache', 'clean']],
  'pip-cache': ['cmd.exe', ['/d', '/c', 'pip', 'cache', 'purge']],
  'nuget-cache': ['dotnet', ['nuget', 'locals', 'all', '--clear']],
  // Volumes stay: they hold data of containers; images and stopped containers go.
  'docker-prune': ['docker', ['system', 'prune', '--all', '--force']],
};

export async function runFix(fix: DiskFix): Promise<FixResult> {
  if (fix === 'storage-settings') {
    await shell.openExternal('ms-settings:storagesense');
    return { ok: true, output: '' };
  }
  const command = COMMANDS[fix];
  if (!command) {
    return { ok: false, output: 'Unknown cleanup' };
  }
  return run(command[0], command[1]);
}

/** Empties the Recycle Bin of one disk, for good: the user confirms it on the page. */
export function emptyRecycleBin(mount: string): Promise<FixResult> {
  const letter = /^([A-Za-z]):$/.exec(mount)?.[1];
  if (!letter) {
    return Promise.resolve({ ok: false, output: 'Not a disk' });
  }
  return run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Clear-RecycleBin -DriveLetter ${letter.toUpperCase()} -Force`,
  ]);
}

function run(file: string, args: string[]): Promise<FixResult> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { windowsHide: true, timeout: TIMEOUT_MS, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const output = `${stdout}\n${stderr}`.trim().slice(-400);
        resolve({ ok: !error, output: error && !output ? error.message : output });
      },
    );
  });
}
