import { KeyValueStore } from './platform';

/** The key the web app has always used, so a signed-in browser stays signed in. */
const TOKEN_KEY = 'pd.accessToken';

type Listener = (token: string | null) => void;

/**
 * The signed-in session: the access token, kept in the platform's storage. Other parts (the API
 * client, live events, the UI) follow it through `subscribe`.
 */
export class Session {
  private current: string | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly storage: KeyValueStore) {}

  get token(): string | null {
    return this.current;
  }

  get isSignedIn(): boolean {
    return this.current !== null;
  }

  /** Reads the saved token (on app start). */
  async restore(): Promise<string | null> {
    this.change(await this.storage.get(TOKEN_KEY));
    return this.current;
  }

  /** After signing in. */
  async start(token: string): Promise<void> {
    await this.storage.set(TOKEN_KEY, token);
    this.change(token);
  }

  /** Signing out, or the server said the token is no longer valid. */
  async end(): Promise<void> {
    await this.storage.remove(TOKEN_KEY);
    this.change(null);
  }

  /** Calls `listener` on every change of the token; returns the unsubscribe function. */
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
