import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Requests to addresses users give — a site to monitor, a page of a shop, an AI endpoint.
 * A user who can sign up could point one at the server's own network (`127.0.0.1`, the cloud's
 * metadata at `169.254.169.254`, a database on `10.*`) and read what comes back: SSRF. So on an
 * instance with open registration private addresses are refused; on a personal one they are
 * allowed — its owner monitors their own NAS and talks to Ollama on localhost.
 *
 * The policy is set once at startup (OutboundPolicy); `safeFetch` follows redirects itself and
 * checks every hop. The address is resolved before the request and not pinned for it, so a DNS
 * answer that changes in between (rebinding) is not covered.
 */
let privateAllowed = true;

export function setPrivateAddressesAllowed(allowed: boolean): void {
  privateAllowed = allowed;
}

export function privateAddressesAllowed(): boolean {
  return privateAllowed;
}

/** Thrown for an address that is not allowed; the message is safe to show to the user. */
export class OutboundBlockedError extends Error {
  /** As network errors carry a code: the checks show it as the reason. */
  readonly code = 'ADDRESS_NOT_ALLOWED';

  constructor(host: string) {
    super(`Requests to private and local addresses are not allowed: ${host}`);
    this.name = 'OutboundBlockedError';
  }
}

const MAX_REDIRECTS = 5;

function isPrivateV4(address: string): boolean {
  const [a, b] = address.split('.').map(Number);
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) || // protocol assignments
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved
  );
}

/** An address inside the server's own machine or network, or one that is nobody's. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '').toLowerCase();
  const version = isIP(ip);
  if (version === 4) {
    return isPrivateV4(ip);
  }
  if (version !== 6) {
    return true; // Not an address at all: nothing to connect to.
  }
  // An IPv4 address written as IPv6 (`::ffff:10.0.0.1`) is that IPv4 address.
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    return isPrivateV4(mapped[1]);
  }
  return (
    ip === '::' ||
    ip === '::1' ||
    ip.startsWith('::ffff:') || // mapped, written in hex
    /^f[cd]/.test(ip) || // unique local
    /^fe[89ab]/.test(ip) || // link-local
    ip.startsWith('ff') // multicast
  );
}

/** Refuses a host that is, or resolves to, a private address — unless they are allowed. */
export async function assertPublicHost(hostname: string): Promise<void> {
  if (privateAllowed) {
    return;
  }
  const host = hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new OutboundBlockedError(hostname);
    }
    return;
  }
  // Every address the name has: one private among them is enough to refuse.
  const addresses = await lookup(host, { all: true });
  if (addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new OutboundBlockedError(hostname);
  }
}

/**
 * `fetch` for an address a user gave: only http(s), and every redirect is checked like the
 * first address — a public page must not lead into the private network.
 */
export async function safeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let current = new URL(url);
  let request = init;
  for (let hop = 0; ; hop++) {
    if (current.protocol !== 'http:' && current.protocol !== 'https:') {
      throw new OutboundBlockedError(current.protocol);
    }
    await assertPublicHost(current.hostname);
    const response = await fetch(current.href, { ...request, redirect: 'manual' });
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) {
      return response;
    }
    if (init.redirect === 'manual') {
      return response;
    }
    await response.body?.cancel();
    if (init.redirect === 'error' || hop >= MAX_REDIRECTS) {
      throw new Error(`Too many redirects: ${url}`);
    }
    current = new URL(location, current);
    // As browsers do: after "see other" (and after a POST moved) the next request is a GET.
    if (response.status === 303 || (response.status < 303 && request.method === 'POST')) {
      request = { ...request, method: 'GET', body: undefined };
    }
  }
}
