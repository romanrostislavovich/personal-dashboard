import { app } from 'electron';
import { ChildProcess, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

/** A rectangle on the screen in physical pixels: x, y, width, height. */
export type ScreenBox = [number, number, number, number];

/** What the script tells (assets/writing-watch.ps1). */
export type FieldEvent =
  | { type: 'field'; app: string; text: string; box: ScreenBox }
  | { type: 'none' }
  | { type: 'caret'; at: number };

/** A watcher that died comes back after this long. */
const RESTART_MS = 10_000;

/**
 * The text field the user types in, in any program, through Windows UI Automation (a
 * PowerShell script, so no native module is built): its text, where its words are on the
 * screen, and a fix typed over a word. Windows only.
 */
export class FieldWatch {
  private child: ChildProcess | null = null;
  private next = 0;
  private readonly waiting = new Map<number, (answer: Record<string, unknown>) => void>();
  private stopped = true;

  constructor(private readonly onEvent: (event: FieldEvent) => void) {}

  static get supported(): boolean {
    return process.platform === 'win32';
  }

  start(): void {
    if (!FieldWatch.supported || this.child) {
      return;
    }
    this.stopped = false;
    // PowerShell cannot run a file from inside the app's archive: the script is copied out.
    const script = join(app.getPath('userData'), 'writing-watch.ps1');
    writeFileSync(script, readFileSync(join(__dirname, 'assets', 'writing-watch.ps1')));
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] },
    );
    this.child = child;
    createInterface({ input: child.stdout! }).on('line', (line) => this.onLine(line));
    // PowerShell missing or blocked: without a listener the error would end the whole app.
    child.on('error', () => this.ended(child));
    child.on('exit', () => this.ended(child));
  }

  stop(): void {
    this.stopped = true;
    this.child?.kill();
    this.child = null;
    this.onEvent({ type: 'none' });
  }

  /** Where each stretch of the text is on the screen (a word over two lines has two boxes). */
  async rects(ranges: [number, number][]): Promise<ScreenBox[][]> {
    const answer = await this.ask({ cmd: 'rects', ranges });
    return (answer?.['rects'] as ScreenBox[][] | undefined) ?? ranges.map(() => []);
  }

  /** Types `text` over a stretch, only if it still says `expect`. */
  async replace(start: number, length: number, text: string, expect: string): Promise<boolean> {
    const answer = await this.ask({ cmd: 'replace', start, length, text, expect });
    return answer?.['ok'] === true;
  }

  private ask(command: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const child = this.child;
    if (!child?.stdin?.writable) {
      return Promise.resolve(null);
    }
    const id = ++this.next;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        resolve(null);
      }, 5_000);
      this.waiting.set(id, (answer) => {
        clearTimeout(timer);
        resolve(answer);
      });
      child.stdin?.write(`${JSON.stringify({ ...command, id })}\n`);
    });
  }

  private onLine(line: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    if (typeof message['id'] === 'number' && this.waiting.has(message['id'])) {
      this.waiting.get(message['id'])?.(message);
      this.waiting.delete(message['id']);
      return;
    }
    if (message['type'] === 'field' || message['type'] === 'none' || message['type'] === 'caret') {
      this.onEvent(message as FieldEvent);
    }
  }

  private ended(child: ChildProcess): void {
    if (this.child !== child) {
      return;
    }
    this.child = null;
    this.onEvent({ type: 'none' });
    if (!this.stopped) {
      setTimeout(() => !this.stopped && this.start(), RESTART_MS);
    }
  }
}
