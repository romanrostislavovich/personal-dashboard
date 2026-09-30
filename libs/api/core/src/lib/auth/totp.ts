import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Time-based one-time passwords (RFC 6238) — what Google Authenticator, 1Password, Aegis and the
 * like show: HMAC-SHA1, 30-second steps, 6 digits.
 */
const STEP_SECONDS = 30;
const DIGITS = 6;
/** A code from the previous or the next step is accepted too: phone clocks drift. */
const WINDOW = 1;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** A new secret, base32 as the apps expect: 160 bits, as RFC 4226 recommends. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** `otpauth://` — the link and the QR code an authenticator app reads. */
export function totpUrl(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS) });
  return `otpauth://totp/${label}?${params}`;
}

export function totpCode(secret: string, timeMs: number): string {
  return hotp(base32Decode(secret), Math.floor(timeMs / 1000 / STEP_SECONDS));
}

/** Whether `code` is the current one (± one step). */
export function verifyTotp(secret: string, code: string, timeMs = Date.now()): boolean {
  const digits = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(digits)) {
    return false;
  }
  const key = base32Decode(secret);
  const step = Math.floor(timeMs / 1000 / STEP_SECONDS);
  for (let offset = -WINDOW; offset <= WINDOW; offset++) {
    const expected = Buffer.from(hotp(key, step + offset));
    if (timingSafeEqual(expected, Buffer.from(digits))) {
      return true;
    }
  }
  return false;
}

/** HOTP (RFC 4226): the counter's HMAC, dynamically truncated to DIGITS. */
function hotp(key: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const value = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 10 ** DIGITS).padStart(DIGITS, '0');
}

export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) {
      throw new Error('Invalid base32');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
