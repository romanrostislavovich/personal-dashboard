import { app } from 'electron';
import { ChildProcess, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { WindowSample } from './span-builder';

/** How often the window in front is looked at. */
export const SAMPLE_SECONDS = 5;
/** The watcher is started again this long after it stopped by itself. */
const RESTART_MS = 30_000;

/**
 * Watches which window is in front. On Windows a PowerShell script (assets/active-window.ps1)
 * asks the system and prints a JSON line every few seconds — no native module to build. Other
 * systems are not supported yet: the watcher simply never reports.
 */
export class WindowWatcher {
  private child: ChildProcess | null = null;
  private stopped = false;

  constructor(private readonly onSample: (sample: WindowSample | null) => void) {}

  static get supported(): boolean {
    return process.platform === 'win32';
  }

  start(): void {
    if (!WindowWatcher.supported || this.child) {
      return;
    }
    this.stopped = false;
    // PowerShell cannot run a file from inside the app's archive: the script is copied out.
    const script = join(app.getPath('userData'), 'active-window.ps1');
    writeFileSync(script, readFileSync(join(__dirname, '..', 'assets', 'active-window.ps1')));

    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        script,
        '-IntervalSeconds',
        String(SAMPLE_SECONDS),
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    this.child = child;
    createInterface({ input: child.stdout }).on('line', (line) => this.onSample(parse(line)));
    child.on('exit', () => {
      this.child = null;
      // No window is known from now on; the watcher comes back unless it was stopped.
      this.onSample(null);
      if (!this.stopped) {
        setTimeout(() => this.start(), RESTART_MS);
      }
    });
  }

  stop(): void {
    this.stopped = true;
    this.child?.kill();
    this.child = null;
  }
}

/** A line of the script: the window, or `{}` when nothing is in front (the lock screen). */
function parse(line: string): WindowSample | null {
  try {
    const raw = JSON.parse(line) as Partial<WindowSample>;
    return raw.app
      ? {
          app: raw.app,
          name: raw.name || null,
          title: raw.title ?? '',
          fullscreen: Boolean(raw.fullscreen),
        }
      : null;
  } catch {
    return null;
  }
}
