import {
  ArgumentsHost,
  BadGatewayException,
  Catch,
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';

/**
 * Errors nobody caught, with the request they happened in. Nest's own handler logs only
 * "fetch failed" — which page, which service and why is exactly what is needed to fix it.
 *
 * An outside service that did not answer is not a fault of the dashboard: the request gets 502
 * with the reason, and the log gets a warning instead of an error (no message to the owner).
 */
@Catch()
export class UnhandledErrorsFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('UnhandledError');

  constructor(adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof HttpException || host.getType() !== 'http') {
      super.catch(exception, host);
      return;
    }
    const request = host.switchToHttp().getRequest<{ method: string; path: string }>();
    // The path without the query: a query may carry the user's data.
    const where = `${request.method} ${request.path}`;
    const outside = describeFetchFailure(exception);
    if (outside) {
      this.logger.warn(`${where}: ${outside}`);
      super.catch(new BadGatewayException(outside), host);
      return;
    }
    const error = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(`${where}: ${error.message}`, error.stack);
    super.catch(new InternalServerErrorException(), host);
  }
}

/**
 * What went wrong with a request to an outside service, in words; `null` — the error is not
 * about one. Node's `fetch` says only "fetch failed" and keeps the reason in `cause`.
 */
export function describeFetchFailure(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }
  if (error.name === 'TimeoutError' || error.name === 'AbortError') {
    return 'An outside service did not answer in time';
  }
  if (!(error instanceof TypeError) || error.message !== 'fetch failed') {
    return null;
  }
  const cause = error.cause as { code?: string; hostname?: string; message?: string } | undefined;
  const reason = [cause?.code, cause?.hostname].filter(Boolean).join(' ') || cause?.message;
  return `An outside service could not be reached${reason ? ` (${reason})` : ''}`;
}
