import type {NextFunction, Request, Response} from 'express';
import {processCounters} from './process-counters';
import {newTraceId, withTrace} from './trace';

/**
 * Every request gets an id (the client's `X-Request-Id` when it sent one), sent back in the same
 * header and carried by every log line of the request; its status and duration go to the
 * process counters. The host sets it first: `app.use(traceRequests)`.
 */
export function traceRequests(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const id = newTraceId(request.header('x-request-id'));
  const started = performance.now();
  response.setHeader('X-Request-Id', id);
  response.on('finish', () =>
    processCounters.request(
      response.statusCode,
      Math.round(performance.now() - started),
    ),
  );
  withTrace({id}, next);
}
