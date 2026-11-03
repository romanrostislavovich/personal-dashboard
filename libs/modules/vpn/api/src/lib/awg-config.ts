import {generateKeyPairSync, randomBytes, randomInt} from 'node:crypto';

/**
 * AmneziaWG's own settings: junk packets before the handshake (`Jc`, `Jmin`, `Jmax`), random
 * prefixes of the handshake packets (`S1`, `S2`) and the packet type numbers (`H1`–`H4`). Both
 * sides need the same `S` and `H`; with them the traffic does not look like WireGuard to a DPI.
 * Only the parameters of AmneziaWG 1.0 are used: every client app knows them.
 */
export interface AwgObfuscation {
  jc: number;
  jmin: number;
  jmax: number;
  s1: number;
  s2: number;
  h1: number;
  h2: number;
  h3: number;
  h4: number;
}

/** A key pair of WireGuard (Curve25519), both halves base64 like `wg genkey` prints them. */
export interface KeyPair {
  privateKey: string;
  publicKey: string;
}

/** The tunnel's addresses: the server is `.1`, the devices get `.2`–`.254`. */
export const VPN_SUBNET = '10.77.0';
export const SERVER_ADDRESS = `${VPN_SUBNET}.1`;
/** Cloudflare's resolvers, as the owner chose. */
export const VPN_DNS = '1.1.1.1, 1.0.0.1';
/** The handshake is renewed every 2 minutes while traffic flows: older means not connected. */
export const ONLINE_HANDSHAKE_SECONDS = 180;

export function generateKeyPair(): KeyPair {
  const {privateKey, publicKey} = generateKeyPairSync('x25519');
  // The raw 32 bytes are the last ones of the DER encodings.
  return {
    privateKey: privateKey
      .export({format: 'der', type: 'pkcs8'})
      .subarray(-32)
      .toString('base64'),
    publicKey: publicKey
      .export({format: 'der', type: 'spki'})
      .subarray(-32)
      .toString('base64'),
  };
}

/** A preshared key: one more symmetric layer per device, base64 of 32 random bytes. */
export function generatePresharedKey(): string {
  return randomBytes(32).toString('base64');
}

/**
 * New obfuscation settings within AmneziaWG's limits: `S1 + 56 ≠ S2` (the two handshake
 * packets would have the same size again), the `H` all different and above 4 (1–4 are plain
 * WireGuard's types), the junk packets smaller than any MTU.
 */
export function generateObfuscation(): AwgObfuscation {
  const s1 = randomInt(15, 151);
  let s2 = randomInt(15, 151);
  while (s1 + 56 === s2) {
    s2 = randomInt(15, 151);
  }
  const types = new Set<number>();
  while (types.size < 4) {
    types.add(randomInt(5, 2 ** 31 - 1));
  }
  const [h1, h2, h3, h4] = [...types];
  return {
    jc: randomInt(4, 9),
    jmin: 40,
    jmax: 70,
    s1,
    s2,
    h1,
    h2,
    h3,
    h4,
  };
}

/** The lowest free address of the subnet, or `null` when all 253 are taken. */
export function freeAddress(taken: Iterable<string>): string | null {
  const used = new Set(taken);
  for (let host = 2; host <= 254; host++) {
    const address = `${VPN_SUBNET}.${host}`;
    if (!used.has(address)) {
      return address;
    }
  }
  return null;
}

function obfuscationLines(o: AwgObfuscation): string[] {
  return [
    `Jc = ${o.jc}`,
    `Jmin = ${o.jmin}`,
    `Jmax = ${o.jmax}`,
    `S1 = ${o.s1}`,
    `S2 = ${o.s2}`,
    `H1 = ${o.h1}`,
    `H2 = ${o.h2}`,
    `H3 = ${o.h3}`,
    `H4 = ${o.h4}`,
  ];
}

export interface ServerPeer {
  publicKey: string;
  presharedKey: string;
  address: string;
}

/**
 * The server's interface for `awg setconf` (deploy/vpn/entrypoint.sh): no `Address` or `DNS` —
 * those are wg-quick's, the container sets the address itself.
 */
export function serverConfig(
  server: {privateKey: string; port: number; obfuscation: AwgObfuscation},
  peers: ServerPeer[],
): string {
  return [
    '[Interface]',
    `PrivateKey = ${server.privateKey}`,
    `ListenPort = ${server.port}`,
    ...obfuscationLines(server.obfuscation),
    ...peers.flatMap(peer => [
      '',
      '[Peer]',
      `PublicKey = ${peer.publicKey}`,
      `PresharedKey = ${peer.presharedKey}`,
      `AllowedIPs = ${peer.address}/32`,
    ]),
    '',
  ].join('\n');
}

/**
 * A device's config for the AmneziaWG / AmneziaVPN app (a file or a QR code). All traffic goes
 * through the tunnel, IPv6 too: the server has no IPv6 inside it, so nothing leaks around it,
 * and the Windows client then blocks whatever would go outside (its kill switch).
 */
export function deviceConfig(
  device: {privateKey: string; presharedKey: string; address: string},
  server: {
    publicKey: string;
    host: string;
    port: number;
    obfuscation: AwgObfuscation;
  },
): string {
  return [
    '[Interface]',
    `PrivateKey = ${device.privateKey}`,
    `Address = ${device.address}/32`,
    `DNS = ${VPN_DNS}`,
    ...obfuscationLines(server.obfuscation),
    '',
    '[Peer]',
    `PublicKey = ${server.publicKey}`,
    `PresharedKey = ${device.presharedKey}`,
    `Endpoint = ${server.host}:${server.port}`,
    'AllowedIPs = 0.0.0.0/0, ::/0',
    // Keeps a home router's NAT open, so the server's answers find the device.
    'PersistentKeepalive = 25',
    '',
  ].join('\n');
}

/** One peer of the status file the container writes every 30 seconds. */
export interface PeerStatus {
  publicKey: string;
  /** `ip:port` the device came from last, `null` before the first handshake. */
  endpoint: string | null;
  /** Unix seconds; 0 — never. */
  latestHandshake: number;
  /** Bytes from the device (its upload) and to it (its download) since the interface started. */
  rx: number;
  tx: number;
}

/**
 * The status file: a line per peer, tab-separated `publicKey endpoint handshake rx tx` (the
 * container cuts them out of `awg show awg0 dump`, which also holds the keys). A broken line
 * is skipped.
 */
export function parseStatus(text: string): PeerStatus[] {
  return text.split('\n').flatMap(line => {
    const [publicKey, endpoint, handshake, rx, tx] = line.trim().split('\t');
    if (!publicKey || tx === undefined) {
      return [];
    }
    const numbers = [handshake, rx, tx].map(Number);
    if (numbers.some(value => !Number.isFinite(value) || value < 0)) {
      return [];
    }
    return [
      {
        publicKey,
        endpoint: endpoint && endpoint !== '(none)' ? endpoint : null,
        latestHandshake: numbers[0],
        rx: numbers[1],
        tx: numbers[2],
      },
    ];
  });
}

/** The address of an `ip:port` endpoint (`[v6]:port` too). */
export function endpointAddress(endpoint: string): string {
  const v6 = /^\[(.+)\]:\d+$/.exec(endpoint);
  if (v6) {
    return v6[1];
  }
  return endpoint.replace(/:\d+$/, '');
}

/**
 * The network an address belongs to, for "a new network": an IPv4 `/16` (a mobile operator
 * hands out addresses from a few such blocks, so moving around the city is not "new"), an
 * IPv6 `/48`.
 */
export function networkOf(address: string): string {
  if (address.includes(':')) {
    const groups = expandV6(address).slice(0, 3);
    return `${groups.join(':')}::/48`;
  }
  const [a, b] = address.split('.');
  return `${a}.${b}.0.0/16`;
}

function expandV6(address: string): string[] {
  const [head, tail = ''] = address.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const missing = 8 - left.length - right.length;
  return [...left, ...Array<string>(Math.max(0, missing)).fill('0'), ...right]
    .map(group => group.toLowerCase().replace(/^0+(?=.)/, ''))
    .slice(0, 8);
}

/** Bytes counted since the last look: a counter smaller than before means the interface restarted. */
export function counterDelta(current: number, previous: number): number {
  return current >= previous ? current - previous : current;
}
