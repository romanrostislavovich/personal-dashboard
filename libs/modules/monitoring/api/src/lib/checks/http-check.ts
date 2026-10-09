import { safeFetch } from '@pd/api-core';

export interface HttpCheckResult {
  isUp: boolean;
  statusCode: number | null;
  /** Time until the response headers arrive, ms. */
  responseMs: number | null;
  error: string | null;
}

const TIMEOUT_MS = 10_000;

/** One request to the address. "Up" = a 2xx/3xx response within the timeout. */
export async function checkHttp(url: string): Promise<HttpCheckResult> {
  const startedAt = performance.now();
  try {
    // The address is the user's: not into the server's own network, on any redirect.
    const response = await safeFetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'personal-dashboard-uptime/1.0' },
    });
    const responseMs = Math.round(performance.now() - startedAt);
    // The body is not needed — do not download it.
    await response.body?.cancel();
    return {
      isUp: response.status < 400,
      statusCode: response.status,
      responseMs,
      error: response.status < 400 ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    return {
      isUp: false,
      statusCode: null,
      responseMs: null,
      error: isTimeout ? `Timeout ${TIMEOUT_MS / 1000}s` : describeNetworkError(error),
    };
  }
}

/** fetch hides the real cause (DNS, connection refused, TLS) in `cause`. */
function describeNetworkError(error: unknown): string {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
    return error.code; // Refused before any request: ADDRESS_NOT_ALLOWED.
  }
  if (error instanceof Error && error.cause instanceof Error) {
    const code = (error.cause as Error & { code?: string }).code;
    return code ?? error.cause.message;
  }
  return error instanceof Error ? error.message : String(error);
}
