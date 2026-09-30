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
 * A 401 ends the session — the token has expired or was revoked — except for the sign-in
 * request itself, where it just means a wrong password.
 */
export class ApiClient {
  private readonly fetch: typeof fetch;

  constructor(
    private readonly platform: ClientPlatform,
    private readonly session: Session,
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
    const response = await this.send('GET', path, {}, '*/*');
    if (!response.ok) {
      throw await this.failure(path, response);
    }
    return response.blob();
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
    const response = await this.send(method, path, options, 'application/json');
    if (!response.ok) {
      throw await this.failure(path, response);
    }
    return (await readBody(response)) as T;
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

  /** The error for a failed answer; a 401 also ends the session (see the class comment). */
  private async failure(path: string, response: Response): Promise<ApiError> {
    if (response.status === 401 && !isSignIn(path)) {
      await this.session.end();
    }
    return new ApiError(response.status, await readBody(response));
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

function isSignIn(path: string): boolean {
  return path.startsWith('/api/auth/login') || path.startsWith('/api/auth/register');
}
