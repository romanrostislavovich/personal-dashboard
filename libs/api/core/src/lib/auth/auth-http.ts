import { ClientMeta } from './sessions.service';

/** The parts of an Express request and response the auth endpoints use. */
export interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  /** The client's address; behind the proxy it comes from X-Forwarded-For (`trust proxy`). */
  ip?: string;
  secure?: boolean;
}

export interface AuthResponse {
  cookie(name: string, value: string, options: CookieOptions): void;
  clearCookie(name: string, options: CookieOptions): void;
}

interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict';
  path: string;
  maxAge?: number;
}

/**
 * The web keeps its refresh token here: httpOnly — scripts on the page (an XSS) cannot read it;
 * SameSite=Strict — other sites cannot send it; only `/api/auth` gets it.
 */
export const REFRESH_COOKIE = 'pd_refresh';
const COOKIE_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

export function setRefreshCookie(request: AuthRequest, response: AuthResponse, token: string) {
  response.cookie(REFRESH_COOKIE, token, { ...cookieOptions(request), maxAge: COOKIE_MAX_AGE_MS });
}

export function clearRefreshCookie(request: AuthRequest, response: AuthResponse) {
  response.clearCookie(REFRESH_COOKIE, cookieOptions(request));
}

/** The refresh token from the app (the body) or from the cookie (the web). */
export function refreshTokenOf(request: AuthRequest, fromBody?: string): string | null {
  return fromBody ?? readCookie(request, REFRESH_COOKIE);
}

export function clientMeta(request: AuthRequest): ClientMeta {
  const agent = request.headers['user-agent'];
  return {
    userAgent: (Array.isArray(agent) ? agent[0] : agent)?.slice(0, 300) ?? null,
    ip: request.ip ?? null,
  };
}

function cookieOptions(request: AuthRequest) {
  return {
    httpOnly: true,
    // Plain http only on localhost (a local copy); browsers reject Secure cookies there otherwise.
    secure: request.secure ?? false,
    sameSite: 'strict' as const,
    path: '/api/auth',
  };
}

function readCookie(request: AuthRequest, name: string): string | null {
  const header = request.headers['cookie'];
  const cookies = Array.isArray(header) ? header.join('; ') : (header ?? '');
  for (const part of cookies.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) {
      return decodeURIComponent(value.join('='));
    }
  }
  return null;
}
