import { KeyValueStore } from './platform';

/** Where an app keeps its refresh token (the web keeps it in an httpOnly cookie instead). */
const REFRESH_KEY = 'pd.refreshToken';

type Listener = (token: string | null) => void;

/**
 * The signed-in session. The access token lives only in memory and for 15 minutes; a new one
 * comes from the refresh token — an httpOnly cookie in a browser (out of reach of page scripts),
 * the platform's secure storage in an app. Other parts (the API client, live events, the UI)
 * follow the access token through `subscribe`.
 */
export class Session {
  private current: string | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly storage: KeyValueStore,
    /** `cookie` — the browser keeps the refresh token; `storage` — this session does. */
    private readonly refreshTokenIn: 'cookie' | 'storage',
  ) {}

  /** The access token. */
  get token(): string | null {
    return this.current;
  }

  get isSignedIn(): boolean {
    return this.current !== null;
  }

  get keepsRefreshToken(): boolean {
    return this.refreshTokenIn === 'storage';
  }

  /** The saved refresh token (an app); a browser has it in the cookie, `null` here. */
  refreshToken(): Promise<string | null> {
    return this.keepsRefreshToken ? this.storage.get(REFRESH_KEY) : Promise.resolve(null);
  }

  /** After signing in or refreshing: a new access token, and a new refresh token if one came. */
  async start(accessToken: string, refreshToken?: string): Promise<void> {
    if (refreshToken && this.keepsRefreshToken) {
      await this.storage.set(REFRESH_KEY, refreshToken);
    }
    this.change(accessToken);
  }

  /** Signing out, or the server no longer accepts the session. */
  async end(): Promise<void> {
    if (this.keepsRefreshToken) {
      await this.storage.remove(REFRESH_KEY);
    }
    this.change(null);
  }

  /** Calls `listener` on every change of the access token; returns the unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private change(token: string | null): void {
    if (token === this.current) {
      return;
    }
    this.current = token;
    this.listeners.forEach((listener) => listener(token));
  }
}
