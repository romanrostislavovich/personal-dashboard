import { ConsoleLogger } from '@nestjs/common';
import { SystemLogLevel } from '@pd/contracts';

export interface LoggedProblem {
  level: SystemLogLevel;
  source: string;
  message: string;
  details: string | null;
}

type Sink = (problem: LoggedProblem) => void;

/**
 * The application logger: prints like Nest's own and hands every error and warning to the
 * system log (SystemLogService), so they can be read in the settings instead of
 * `docker compose logs`. The host sets it once: `app.useLogger(new SystemLogger())`.
 */
export class SystemLogger extends ConsoleLogger {
  private static sink: Sink | null = null;

  /** Where errors and warnings go; set by SystemLogService when the app starts. */
  static setSink(sink: Sink | null): void {
    SystemLogger.sink = sink;
  }

  override error(message: unknown, ...rest: unknown[]): void {
    super.error(message, ...rest);
    this.keep('error', message, rest);
  }

  override warn(message: unknown, ...rest: unknown[]): void {
    super.warn(message, ...rest);
    this.keep('warn', message, rest);
  }

  /**
   * Nest calls `error(message, stack?, context?)` and `warn(message, context?)`: the context is
   * always the last string, a stack trace is a string before it.
   */
  private keep(level: SystemLogLevel, message: unknown, rest: unknown[]): void {
    const strings = rest.filter((item): item is string => typeof item === 'string');
    const source = strings.pop() ?? this.context ?? 'Application';
    const error = message instanceof Error ? message : null;
    try {
      SystemLogger.sink?.({
        level,
        source,
        message: error ? error.message : String(message),
        details: strings[0] ?? error?.stack ?? null,
      });
    } catch {
      // The log of problems must never become a problem itself.
    }
  }
}
