import { connect } from 'node:tls';
import { AppFacts } from './app-security.rules';

const TIMEOUT_MS = 10_000;

/** Headers a site is expected to send; the value says what each one is for. */
const EXPECTED_HEADERS = [
  'strict-transport-security', // The browser never tries plain HTTP again.
  'x-content-type-options', // No guessing of content types.
  'referrer-policy', // Addresses of the dashboard's pages do not leak to other sites.
];

/**
 * The dashboard's public address as a visitor sees it: HTTPS, how long the certificate lasts,
 * which security headers are missing. `null` for a local address — there is nothing to check.
 */
export async function checkSite(publicUrl: string): Promise<AppFacts['site']> {
  const url = new URL(publicUrl);
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    return null;
  }
  const site = {
    url: url.origin,
    https: url.protocol === 'https:',
    certificateDaysLeft: null as number | null,
    missingHeaders: [] as string[],
    error: null as string | null,
  };
  if (!site.https) {
    return site;
  }
  try {
    const response = await fetch(url.origin, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    await response.body?.cancel();
    site.missingHeaders = EXPECTED_HEADERS.filter((name) => !response.headers.has(name));
    // Either header keeps the dashboard out of other sites' frames (clickjacking).
    const framed =
      response.headers.has('x-frame-options') ||
      /frame-ancestors/i.test(response.headers.get('content-security-policy') ?? '');
    if (!framed) {
      site.missingHeaders.push('x-frame-options');
    }
    site.certificateDaysLeft = await certificateDaysLeft(url.hostname, Number(url.port) || 443);
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    site.error =
      (cause as { code?: string }).code ?? (cause instanceof Error ? cause.message : String(cause));
  }
  return site;
}

function certificateDaysLeft(host: string, port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const socket = connect({ host, port, servername: host, timeout: TIMEOUT_MS }, () => {
      const expires = Date.parse(socket.getPeerCertificate().valid_to);
      socket.end();
      resolve(Number.isNaN(expires) ? null : Math.floor((expires - Date.now()) / 86_400_000));
    });
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
  });
}
