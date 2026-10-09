import { safeFetch } from '@pd/api-core';

const TIMEOUT_MS = 15_000;
/** A product page is rarely over a megabyte; the rest of a huge one is not read. */
const MAX_LENGTH = 3_000_000;

/**
 * The request says what it is. Shops that turn scripts away (403) tell them by more than the
 * headers: a browser's User-Agent got the same answers, so there is no point in pretending.
 */
const HEADERS = {
  'User-Agent': 'personal-dashboard-wishlist/1.0',
  Accept: 'text/html,application/xhtml+xml',
};

/** The HTML of a page, or why it could not be loaded (`HTTP 403`, `timeout`, `ENOTFOUND`). */
export async function fetchPage(url: string): Promise<{ html: string } | { error: string }> {
  try {
    // The address is the user's: not into the server's own network, on any redirect.
    const response = await safeFetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: HEADERS,
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { error: `HTTP ${response.status}` };
    }
    return { html: (await response.text()).slice(0, MAX_LENGTH) };
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return { error: 'timeout' };
    }
    // fetch hides the real cause (DNS, connection refused, TLS) in `cause`.
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    const code = (cause as { code?: string }).code;
    return { error: code ?? (cause instanceof Error ? cause.message : String(cause)) };
  }
}
