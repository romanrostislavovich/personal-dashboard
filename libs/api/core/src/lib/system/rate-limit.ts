import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../auth/current-user.decorator';

const RATE_LIMIT = 'rateLimit';
/** Keys kept at most; the oldest windows give way beyond it. */
const MAX_KEYS = 10_000;

interface Limit {
  /** Requests allowed… */
  limit: number;
  /** …within this many seconds. */
  perSeconds: number;
}

/**
 * Caps how often a request may be made — by a user, or by an address before signing in. For
 * what costs: a call to the AI, an upload, a new account. Read by RateLimitGuard.
 *
 * ```ts
 * @RateLimit(30, 60) // 30 a minute
 * ```
 */
export const RateLimit = (limit: number, perSeconds: number) =>
  SetMetadata(RATE_LIMIT, { limit, perSeconds } satisfies Limit);

/** Fixed windows a key; kept in memory, which is fine for one server. */
export class RateLimiter {
  private readonly windows = new Map<string, { count: number; since: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Counts a request; the seconds to wait when it is one too many, `null` when it may go. */
  hit(key: string, { limit, perSeconds }: Limit): number | null {
    const now = this.now();
    const windowMs = perSeconds * 1000;
    let window = this.windows.get(key);
    if (!window || now - window.since >= windowMs) {
      window = { count: 0, since: now };
      // Re-inserted: the map keeps the newest windows last, the oldest are pruned first.
      this.windows.delete(key);
      this.windows.set(key, window);
      this.prune();
    }
    window.count++;
    return window.count > limit ? Math.ceil((window.since + windowMs - now) / 1000) : null;
  }

  private prune(): void {
    for (const key of this.windows.keys()) {
      if (this.windows.size <= MAX_KEYS) {
        return;
      }
      this.windows.delete(key);
    }
  }
}

/** Applies `@RateLimit`: a request over the limit gets 429 and how long to wait. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly limiter = new RateLimiter();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const limit = this.reflector.getAllAndOverride<Limit | undefined>(RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!limit) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{ user?: AuthUser; ip?: string }>();
    const who = request.user?.id ?? `ip:${request.ip ?? 'unknown'}`;
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    const retryAfter = this.limiter.hit(`${route}:${who}`, limit);
    if (retryAfter !== null) {
      throw new HttpException(
        { message: 'Too many requests, try again later', retryAfter },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
