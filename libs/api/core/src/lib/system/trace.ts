import {AsyncLocalStorage} from 'node:async_hooks';
import {randomBytes} from 'node:crypto';

/**
 * What the server is doing right now — one HTTP request or one run of a background job — with an
 * id that every log line written meanwhile carries (SystemLogger), so a request's lines can be
 * found together in `docker compose logs`.
 */
export interface Trace {
  id: string;
  /** The job's name (`<module>.<job>`) for a background run. */
  job?: string;
}

const traces = new AsyncLocalStorage<Trace>();

/** An id given by a client (`X-Request-Id`) is kept when it looks like one. */
const GIVEN_ID = /^[\w-]{6,64}$/;

export function newTraceId(given?: string | null): string {
  return given && GIVEN_ID.test(given) ? given : randomBytes(6).toString('hex');
}

export function currentTrace(): Trace | undefined {
  return traces.getStore();
}

/** Runs `work` with `trace` as the current one, for everything it awaits. */
export function withTrace<T>(trace: Trace, work: () => T): T {
  return traces.run(trace, work);
}
