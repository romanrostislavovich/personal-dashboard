import {ConsoleLogger, ConsoleLoggerOptions, LogLevel} from '@nestjs/common';
import {SystemLogLevel} from '@pd/contracts';
import {currentTrace} from './trace';

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
 *
 * In production (or with `LOG_FORMAT=json`) every line is one JSON object with the id of the
 * request or job run it belongs to (`traceId`, `job`), so `docker compose logs app | grep <id>`
 * gives all of one request; `LOG_FORMAT=text` keeps the coloured lines.
 */
export class SystemLogger extends ConsoleLogger {
  private static sink: Sink | null = null;

  constructor(options: ConsoleLoggerOptions = {json: jsonLogs()}) {
    super(options);
  }

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
    const strings = rest.filter(
      (item): item is string => typeof item === 'string',
    );
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

  protected override getJsonLogObject(
    message: unknown,
    options: {
      context: string;
      logLevel: LogLevel;
      writeStreamType?: 'stdout' | 'stderr';
      errorStack?: unknown;
    },
  ) {
    const trace = currentTrace();
    return {
      ...super.getJsonLogObject(message, options),
      ...(trace && {traceId: trace.id, job: trace.job}),
    };
  }
}

/** JSON lines in production unless `LOG_FORMAT=text`; anywhere with `LOG_FORMAT=json`. */
export function jsonLogs(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['LOG_FORMAT']
    ? env['LOG_FORMAT'] === 'json'
    : env['NODE_ENV'] === 'production';
}
