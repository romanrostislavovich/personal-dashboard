import { assertPublicHost } from '@pd/api-core';
import { connect } from 'node:tls';

const TIMEOUT_MS = 10_000;

/** The site's SSL certificate expiry date. `null` for http:// or if it could not be determined. */
export async function fetchSslExpiry(url: string): Promise<Date | null> {
  const { protocol, hostname, port } = new URL(url);
  if (protocol !== 'https:') {
    return null;
  }
  try {
    // The address is the user's: no connection into the server's own network.
    await assertPublicHost(hostname);
  } catch {
    return null;
  }

  return new Promise((resolve) => {
    const socket = connect({
      host: hostname,
      port: Number(port) || 443,
      servername: hostname,
      // We only need the certificate date, even if it is already invalid.
      rejectUnauthorized: false,
    });
    const finish = (value: Date | null) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(TIMEOUT_MS, () => finish(null));
    socket.once('error', () => finish(null));
    socket.once('secureConnect', () => {
      const validTo = socket.getPeerCertificate()?.valid_to;
      finish(validTo ? new Date(validTo) : null);
    });
  });
}
