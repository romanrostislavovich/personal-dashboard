import type { TelemetryMetrics } from '@pd/contracts';

/** Explicit reports only. Never inspect shell history, process arguments, output or commands. */
export interface TerminalCompletion {
  exitCode: number;
  durationMs: number;
  kind: 'command' | 'build';
  context: 'public-terminal';
}

export class TerminalFriction {
  private commands = 0;
  private failures = 0;
  private buildWait = 0;

  report(report: TerminalCompletion): boolean {
    if (
      !report ||
      Object.keys(report).some(
        (key) => !['exitCode', 'durationMs', 'kind', 'context'].includes(key),
      ) ||
      report.context !== 'public-terminal' ||
      !['command', 'build'].includes(report.kind) ||
      !Number.isSafeInteger(report.exitCode) ||
      !Number.isFinite(report.durationMs) ||
      report.durationMs < 0 ||
      report.durationMs > 300_000
    )
      return false;
    this.commands++;
    if (report.exitCode !== 0) this.failures++;
    if (report.kind === 'build')
      this.buildWait = Math.min(300_000, this.buildWait + report.durationMs);
    return true;
  }

  metrics(): TelemetryMetrics {
    return this.commands
      ? {
          terminalCommands: this.commands,
          terminalFailures: this.failures,
          buildWaitMs: this.buildWait,
        }
      : {};
  }
}
