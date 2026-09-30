import { HttpException, HttpStatus } from '@nestjs/common';

/** Failed attempts allowed per key within the window… */
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
/** …the key is then locked for the rest of the window. Entries are pruned beyond this many. */
const MAX_KEYS = 10_000;

interface Failures {
  count: number;
  /** When the window of this key started. */
  since: number;
}

/**
 * Slows down password guessing: after MAX_FAILURES failed sign-ins (or 2FA codes) for one address
 * or one email within 15 minutes, further attempts are refused with 429 until the window ends.
 * Kept in memory: a restart forgets it, which is fine for a single server.
 */
export class LoginThrottle {
  private readonly failures = new Map<string, Failures>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Throws 429 if any of the keys is locked. */
  check(keys: string[]): void {
    for (const key of keys) {
      const entry = this.current(key);
      if (entry && entry.count >= MAX_FAILURES) {
        const retryAfter = Math.ceil((entry.since + WINDOW_MS - this.now()) / 1000);
        throw new HttpException(
          { message: 'Too many attempts, try again later', retryAfter },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  fail(keys: string[]): void {
    for (const key of keys) {
      const entry = this.current(key) ?? { count: 0, since: this.now() };
      entry.count++;
      this.failures.set(key, entry);
    }
    this.prune();
  }

  succeed(keys: string[]): void {
    keys.forEach((key) => this.failures.delete(key));
  }

  private current(key: string): Failures | undefined {
    const entry = this.failures.get(key);
    if (entry && this.now() - entry.since >= WINDOW_MS) {
      this.failures.delete(key);
      return undefined;
    }
    return entry;
  }

  private prune(): void {
    if (this.failures.size <= MAX_KEYS) {
      return;
    }
    for (const key of this.failures.keys()) {
      if (!this.current(key) || this.failures.size > MAX_KEYS) {
        this.failures.delete(key);
      }
    }
  }
}

/** Keys for one sign-in attempt: the address and the account, so neither can be brute-forced. */
export function throttleKeys(ip: string | undefined, email: string): string[] {
  return [`ip:${ip ?? 'unknown'}`, `email:${email.trim().toLowerCase()}`];
}
