import {app} from 'electron';
import type {DesktopTelemetryDiagnostics} from '@pd/contracts';
import {ChildProcess, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {NativeInputAggregate, parseInputAggregate} from './input-dynamics';

export interface TerminalReport {
  durationMs: number;
  exitCode: number;
  category: 'build' | 'test' | 'commit' | 'general';
}

export interface SuccessfulWorkEvent {
  category: 'test' | 'commit';
  durationMs: number;
  completedAt: number;
}

export interface SourceGate {
  identity: string;
  privateWords: string[];
  excludedApps: string[];
  idleMs: number;
}

export function parseTerminalReport(value: unknown): TerminalReport | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const report = value as TerminalReport;
  return Object.keys(report).sort().join(',') ===
    'category,durationMs,exitCode' &&
    ['build', 'test', 'commit', 'general'].includes(report.category) &&
    Number.isSafeInteger(report.exitCode) &&
    Number.isFinite(report.durationMs) &&
    report.durationMs >= 0 &&
    report.durationMs <= 300_000
    ? {
        durationMs: report.durationMs,
        exitCode: report.exitCode,
        category: report.category,
      }
    : null;
}

/** Private stdio for keyboard aggregates; a current-user-only pipe for explicit terminal reports. */
export class TelemetrySources {
  private child: ChildProcess | null = null;
  private identity: string | null = null;
  private retryAt = 0;
  private state: DesktopTelemetryDiagnostics['sources'] = 'stopped';

  constructor(
    private readonly input: (aggregate: NativeInputAggregate) => void,
    private readonly terminal: (report: TerminalReport) => void,
  ) {}

  status(): DesktopTelemetryDiagnostics['sources'] {
    return this.state;
  }

  update(gate: SourceGate | null): void {
    if (!gate || process.platform !== 'win32') {
      this.stop();
      return;
    }
    if (this.identity !== gate.identity) this.stop();
    if (!this.child && Date.now() >= this.retryAt) this.start(gate.identity);
    // No server/device credentials are passed to the helper. A missed lease fails closed.
    const {privateWords, excludedApps, idleMs} = gate;
    if (this.child?.stdin?.writable && !this.child.stdin.writableNeedDrain) {
      this.child.stdin.write(
        JSON.stringify({privateWords, excludedApps, idleMs}) + '\n',
      );
    }
  }

  stop(): void {
    const child = this.child;
    this.child = null;
    this.identity = null;
    this.state = 'stopped';
    child?.stdin?.destroy();
    child?.kill();
  }

  private start(identity: string): void {
    this.identity = identity;
    this.state = 'starting';
    this.retryAt = Date.now() + 30_000;
    try {
      const directory = app.getPath('userData');
      const pipe =
        'pd-telemetry-' +
        createHash('sha256').update(directory).digest('hex').slice(0, 24);
      for (const name of [
        'telemetry-watch.ps1',
        'telemetry-native.cs',
        'terminal-telemetry.ps1',
      ]) {
        const prefix =
          name === 'terminal-telemetry.ps1'
            ? `$script:PdTelemetryPipe = '${pipe}'\n`
            : '';
        writeFileSync(
          join(directory, name),
          prefix + readFileSync(join(__dirname, 'assets', name), 'utf8'),
        );
      }
      const child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Mta',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          join(directory, 'telemetry-watch.ps1'),
          '-PipeName',
          pipe,
        ],
        {windowsHide: true, stdio: ['pipe', 'pipe', 'ignore']},
      );
      this.child = child;
      const lines = createInterface({input: child.stdout!});
      lines.on('line', line => {
        if (this.child !== child || line.length > 1024) return;
        try {
          const value = JSON.parse(line);
          if (Object.keys(value).length !== 1) return;
          if (typeof value.ready === 'boolean') {
            this.state = value.ready ? 'running' : 'error';
            return;
          }
          const input = parseInputAggregate(value.input);
          const terminal = parseTerminalReport(value.terminal);
          if (input) this.input(input);
          if (terminal) this.terminal(terminal);
        } catch {
          /* Invalid helper output is discarded, never logged. */
        }
      });
      const ended = () => {
        lines.close();
        if (this.child === child) {
          this.stop();
          this.identity = identity;
          this.state = 'error';
        }
      };
      child.stdin!.on('error', ended);
      child.on('error', ended);
      child.on('exit', ended);
    } catch {
      this.stop();
      this.identity = identity;
      this.state = 'error';
    }
  }
}
