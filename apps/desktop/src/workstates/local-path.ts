import { execFile, spawn } from 'node:child_process';
import { lstat, open, realpath } from 'node:fs/promises';
import { join, win32 } from 'node:path';
import { promisify } from 'node:util';
import { sanitizeTelemetryText, workstateProjectPathSchema } from '@pd/contracts';

const executeFile = promisify(execFile);

/** Fail closed on non-Windows, network/mapped drives, junctions and symbolic links. */
export async function localPath(value: string, kind: 'directory' | 'exe'): Promise<string> {
  if (
    process.platform !== 'win32' ||
    !workstateProjectPathSchema.safeParse(value).success ||
    !/^[a-z]:\\/i.test(value) ||
    value.includes('/') ||
    value.split('\\').some((part) => /[. ]$/.test(part)) ||
    (kind === 'exe' && !value.toLowerCase().endsWith('.exe'))
  )
    throw new Error('Not a local path');
  const root = win32.parse(value).root;
  const { stdout } = await executeFile(
    join(
      process.env['SystemRoot'] ?? 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    ),
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(__dirname, 'assets', 'workstate-drive.ps1'),
      '-Root',
      root,
    ],
    { timeout: 5000, windowsHide: true, maxBuffer: 1024, shell: false },
  );
  if (stdout.trim() !== 'local') throw new Error('Not a fixed local drive');
  let current = root;
  for (const part of value.slice(root.length).split('\\').filter(Boolean)) {
    current = win32.join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error('Linked path');
  }
  const canonical = await realpath(value);
  if (
    canonical.toLowerCase() !== win32.normalize(value).replace(/\\$/, '').toLowerCase() &&
    canonical.toLowerCase() !== root.toLowerCase()
  )
    throw new Error('Redirected path');
  const stat = await lstat(canonical);
  if (stat.isSymbolicLink() || !(kind === 'directory' ? stat.isDirectory() : stat.isFile()))
    throw new Error('Wrong path type');
  return canonical;
}

/** Only an ordinary .git directory and a short symbolic HEAD; worktree pointers are skipped. */
export async function gitBranch(project: string): Promise<string | undefined> {
  try {
    const git = join(project, '.git');
    const directory = await lstat(git);
    if (!directory.isDirectory() || directory.isSymbolicLink()) return undefined;
    const head = join(git, 'HEAD');
    const stat = await lstat(head);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024) return undefined;
    const file = await open(head, 'r');
    try {
      const buffer = Buffer.alloc(1025);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      const match = /^ref: refs\/heads\/([a-zA-Z0-9][a-zA-Z0-9._/-]{0,99})\r?\n?$/.exec(
        buffer.subarray(0, bytesRead).toString('utf8'),
      );
      const branch = match?.[1];
      return branch &&
        !branch.includes('..') &&
        !branch.includes('//') &&
        !branch.endsWith('/') &&
        !branch.endsWith('.') &&
        !branch.endsWith('.lock') &&
        sanitizeTelemetryText(branch) === branch
        ? branch
        : undefined;
    } finally {
      await file.close();
    }
  } catch {
    return undefined;
  }
}

/** Only the executable selected by the user, with one literal directory argument. */
export function launchProject(executable: string, project: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [project], { shell: false, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => resolve());
  });
}
