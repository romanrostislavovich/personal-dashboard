import {
  CurrentUser,
  isTwoFactorChallenge,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
} from '@pd/contracts';
import { ApiClient } from './api-client';
import { API_PATHS, authApi, projectsApi } from './core-api';
import { Outbox } from './outbox';
import { ClientPlatform } from './platform';
import { RealtimeConnection } from './realtime';
import { Session } from './session';

/** Signing in either finishes or asks for a code from the authenticator app. */
/** The profile as last seen, for starting without a connection. */
const USER_KEY = 'pd.user';

export type SignInResult =
  { status: 'signed-in'; user: CurrentUser } | { status: 'code-required'; challengeToken: string };

/**
 * Everything a client needs from the core, wired together. A platform creates it once:
 *
 * ```ts
 * const client = createDashboardClient({ baseUrl: '', storage: browserStorage(), refreshTokenIn: 'cookie' });
 * const user = await client.restoreSession();
 * ```
 */
export function createDashboardClient(platform: ClientPlatform) {
  const refreshTokenIn = platform.refreshTokenIn ?? 'storage';
  const session = new Session(platform.storage, refreshTokenIn);
  const outbox = new Outbox(platform.storage);
  const api = new ApiClient(platform, session, outbox);
  const auth = authApi(api);
  const realtime = new RealtimeConnection(api, session, platform.fetch);
  /** Tells the server where the refresh token should go. */
  const client = refreshTokenIn === 'cookie' ? 'web' : 'app';

  const started = async (response: LoginResponse): Promise<CurrentUser> => {
    await session.start(response.accessToken, response.refreshToken);
    await platform.storage.set(USER_KEY, JSON.stringify(response.user));
    return response.user;
  };

  return {
    session,
    api,
    /** Changes made offline that wait to be sent; `api.flushOutbox()` sends them. */
    outbox,
    auth,
    projects: projectsApi(api),
    realtime,

    /** The password step; with two-factor sign-in on, a code is asked for next. */
    async signIn(credentials: Omit<LoginRequest, 'client'>): Promise<SignInResult> {
      const result = await auth.login({ ...credentials, client });
      return isTwoFactorChallenge(result)
        ? { status: 'code-required', challengeToken: result.challengeToken }
        : { status: 'signed-in', user: await started(result) };
    },

    /** The code from the authenticator app (or a recovery code) for the challenge. */
    async completeSignIn(challengeToken: string, code: string): Promise<CurrentUser> {
      return started(await auth.loginWithCode({ challengeToken, code }));
    },

    async signUp(input: Omit<RegisterRequest, 'client'>): Promise<CurrentUser> {
      return started(await auth.register({ ...input, client }));
    },

    /**
     * On app start: a new access token from the refresh token (the cookie, or the stored one)
     * and the user; `null` when signed out.
     */
    async restoreSession(): Promise<CurrentUser | null> {
      try {
        const result = await api.refresh();
        if (result) {
          await platform.storage.set(USER_KEY, JSON.stringify(result.user));
        } else {
          // The server ended the session: nothing to go on with offline either.
          await platform.storage.remove(USER_KEY);
        }
        return result?.user ?? null;
      } catch {
        return null; // No connection: see `offlineUser`.
      }
    },

    /**
     * The user this device was signed in as when the server could last be reached — for opening
     * the app without a connection: saved data is shown, changes wait in the outbox. `null` —
     * signed out, or never signed in here.
     */
    async offlineUser(): Promise<CurrentUser | null> {
      try {
        const text = await platform.storage.get(USER_KEY);
        return text ? (JSON.parse(text) as CurrentUser) : null;
      } catch {
        return null;
      }
    },

    /** Signs this device out on the server too. */
    async signOut(): Promise<void> {
      const refreshToken = await session.refreshToken();
      await api.post(API_PATHS.logout, refreshToken ? { refreshToken } : {}).catch(() => undefined);
      await platform.storage.remove(USER_KEY);
      await session.end();
    },
  };
}

export type DashboardClient = ReturnType<typeof createDashboardClient>;
