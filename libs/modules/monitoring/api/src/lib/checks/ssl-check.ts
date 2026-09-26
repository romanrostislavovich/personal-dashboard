import { connect } from 'node:tls';

const TIMEOUT_MS = 10_000;

/** Дата окончания SSL-сертификата сайта. `null` для http:// или если узнать не удалось. */
export function fetchSslExpiry(url: string): Promise<Date | null> {
  const { protocol, hostname, port } = new URL(url);
  if (protocol !== 'https:') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const socket = connect({
      host: hostname,
      port: Number(port) || 443,
      servername: hostname,
      // Нам нужна только дата сертификата, даже если он уже невалиден.
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
