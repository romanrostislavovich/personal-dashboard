import { HttpErrorResponse } from '@angular/common/http';
import { ApiError } from '@pd/client-core';
import { defer, Observable } from 'rxjs';

/**
 * A request of the client core as an Observable, sent on subscribe like an `HttpClient` one —
 * so pages keep using `firstValueFrom(api.save(...))` while the request itself lives in the core.
 */
export function fromCore<T>(request: () => Promise<T>): Observable<T> {
  return defer(request);
}

/** The HTTP status of a failed request (client core or `HttpClient`); 0 — no answer. */
export function errorStatus(error: unknown): number {
  if (error instanceof ApiError || error instanceof HttpErrorResponse) {
    return error.status;
  }
  return 0;
}

/** What the server sent with the error: its message, a `reason`… */
export function errorBody(error: unknown): unknown {
  if (error instanceof ApiError) {
    return error.body;
  }
  return error instanceof HttpErrorResponse ? error.error : null;
}
