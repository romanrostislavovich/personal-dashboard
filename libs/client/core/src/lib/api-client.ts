import { LoginResponse } from '@pd/contracts';
import { isQueueable, Outbox, OutboxResult } from './outbox';
import { ClientPlatform } from './platform';
import { Session } from './session';

/** An answer with an error status; `body` is what the server sent (its message, a reason…). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(ApiError.describe(status, body));
  }

  private static describe(status: number, body: unknown): string {
    const message = (body as { message?: unknown } | null)?.message;
    return `API ${status}: ${typeof message === 'string' ? message : 'request failed'}`;
  }
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  /** JSON, or `FormData` for file uploads. */
  body?: unknown;
  /** Unset values (`null`, `undefined`) are left out. */
  query?: QueryParams;
  signal?: AbortSignal;
}

/**
 * A read request: the path and its query parameters. The same object is what Angular's
 * `httpResource` takes, so the web app reads through it and other clients call `ApiClient.read`.
 */
export interface ApiRequest {
  url: string;
  params?: Record<string, string | number>;
}

/** `{ url, params }` without the unset parameters. */
export function apiRequest(url: string, params?: QueryParams): ApiRequest {
  const set = Object.entries(params ?? {}).filter(
    (entry): entry is [string, string | number | boolean] =>
      entry[1] !== null && entry[1] !== undefined,
  );
  return set.length
    ? {
        url,
        params: Object.fromEntries(
          set.map(([key, value]) => [key, typeof value === 'boolean' ? String(value) : value]),
        ),
      }
    : { url };
}

/**
 * Requests to the dashboard API: the server address, the session token, JSON both ways.
 * A 401 means the access token (15 minutes) has expired: a new one is fetched with the refresh
 * token and the request is sent again; if that fails too, the session is over. Sign-in requests
 * are the exception — there a 401 is just a wrong password.
 *
 * Without a connection, a change of the user's own records (see `isQueueable`) is put into the
 * outbox instead of failing: the call resolves with `undefined`, and the change is sent by
 * `flushOutbox` once the server answers again.
 */
export class ApiClient {
  private readonly fetch: typeof fetch;
  private refreshing: Promise<LoginResponse | null> | null = null;

  constructor(
    private readonly platform: ClientPlatform,
    private readonly session: Session,
    /** Where changes made offline wait; without it they fail like any other request. */
    private readonly outbox?: Outbox,
  ) {
    // Called unbound: browsers reject `fetch` invoked as a method of another object.
    const platformFetch = platform.fetch ?? globalThis.fetch;
    this.fetch = (input, init) => platformFetch(input, init);
  }

  /** The full address of an API path (`/api/...`), for things that fetch by themselves. */
  url(path: string, query?: RequestOptions['query']): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) {
        params.set(key, String(value));
      }
    }
    const search = params.toString();
    return `${this.platform.baseUrl.replace(/\/+$/, '')}${path}${search ? `?${search}` : ''}`;
  }

  /** Headers every request carries: the session token. */
  headers(): Record<string, string> {
    const token = this.session.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /** A read request described by `{ url, params }` (see ApiRequest). */
  read<T>(request: ApiRequest, signal?: AbortSignal): Promise<T> {
    return this.get<T>(request.url, { query: request.params, signal });
  }

  /** A file (a diary photo): its bytes, for an object URL. */
  async blob(path: string): Promise<Blob> {
    const response = await this.sendAuthorized('GET', path, {}, '*/*');
    if (!response.ok) {
      throw new ApiError(response.status, await readBody(response));
    }
    return response.blob();
  }

  /**
   * A new access token for the refresh token (the cookie in a browser, the stored one in an app).
   * `null` — the session is over and has been ended. Concurrent callers share one request.
   */
  refresh(): Promise<LoginResponse | null> {
    this.refreshing ??= this.refreshSession().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, options);
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, { ...options, body });
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, { ...options, body });
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, { ...options, body });
  }

  delete<T = void>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, options);
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    try {
      return await this.requestNow<T>(method, path, options);
    } catch (error) {
      // An error status is an answer; anything else means the server was not reached.
      const unreachable = !(error instanceof ApiError) && !options.signal?.aborted;
      if (this.outbox && unreachable && isQueueable(method, path, options.body)) {
        await this.outbox.add(method, path, options.body);
        return undefined as T;
      }
      throw error;
    }
  }

  /** Sends the changes made offline, oldest first (see Outbox). */
  async flushOutbox(): Promise<OutboxResult> {
    if (!this.outbox) {
      return { sent: 0, refused: [], left: 0 };
    }
    return this.outbox.flush(async (write) => {
      await this.requestNow(write.method, write.path, { body: write.body });
    });
  }

  private async requestNow<T>(method: string, path: string, options: RequestOptions): Promise<T> {
    const response = await this.sendAuthorized(method, path, options, 'application/json');
    const body = await readBody(response);
    if (!response.ok) {
      throw new ApiError(response.status, body);
    }
    return body as T;
  }

  /** Sends; on a 401 refreshes the access token once and sends again. */
  private async sendAuthorized(
    method: string,
    path: string,
    options: RequestOptions,
    accept: string,
  ): Promise<Response> {
    const response = await this.send(method, path, options, accept);
    if (response.status !== 401 || isAuthRequest(path)) {
      return response;
    }
    return (await this.refresh()) ? this.send(method, path, options, accept) : response;
  }

  private async refreshSession(): Promise<LoginResponse | null> {
    const refreshToken = await this.session.refreshToken();
    if (this.session.keepsRefreshToken && !refreshToken) {
      await this.session.end();
      return null;
    }
    // No connection: the error goes up and the session stays — it may work again later.
    const response = await this.send(
      'POST',
      REFRESH_PATH,
      { body: refreshToken ? { refreshToken } : {} },
      'application/json',
    );
    if (!response.ok) {
      await this.session.end();
      return null;
    }
    const result = (await readBody(response)) as LoginResponse;
    await this.session.start(result.accessToken, result.refreshToken);
    return result;
  }

  private send(
    method: string,
    path: string,
    { body, query, signal }: RequestOptions,
    accept: string,
  ): Promise<Response> {
    // The browser sets the multipart boundary itself for FormData.
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const isJson = body !== undefined && !isForm;
    return this.fetch(this.url(path, query), {
      method,
      headers: {
        Accept: accept,
        ...(isJson ? { 'Content-Type': 'application/json' } : {}),
        ...this.headers(),
      },
      body: isForm ? (body as FormData) : isJson ? JSON.stringify(body) : undefined,
      signal,
    });
  }
}

/** JSON when the server sent it, text otherwise, `undefined` for an empty answer (204). */
async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** In `core-api.ts` too; kept here to avoid an import cycle. */
const REFRESH_PATH = '/api/auth/refresh';

/** Sign-in, refresh and sign-out: a 401 there is the answer itself, not an expired token. */
function isAuthRequest(path: string): boolean {
  return ['/api/auth/login', '/api/auth/register', REFRESH_PATH, '/api/auth/logout'].some(
    (prefix) => path.startsWith(prefix),
  );
}
