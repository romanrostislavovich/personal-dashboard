import {
  CurrentUser,
  isTwoFactorChallenge,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
} from '@pd/contracts';
import { ApiClient } from './api-client';
import { API_PATHS, authApi, projectsApi } from './core-api';
import { ClientPlatform } from './platform';
import { RealtimeConnection } from './realtime';
import { Session } from './session';

/** Signing in either finishes or asks for a code from the authenticator app. */
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
  const api = new ApiClient(platform, session);
  const auth = authApi(api);
  const realtime = new RealtimeConnection(api, session, platform.fetch);
  /** Tells the server where the refresh token should go. */
  const client = refreshTokenIn === 'cookie' ? 'web' : 'app';

  const started = async (response: LoginResponse): Promise<CurrentUser> => {
    await session.start(response.accessToken, response.refreshToken);
    return response.user;
  };

  return {
    session,
    api,
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
        return (await api.refresh())?.user ?? null;
      } catch {
        return null; // No connection: signed out for now, the page offers to sign in.
      }
    },

    /** Signs this device out on the server too. */
    async signOut(): Promise<void> {
      const refreshToken = await session.refreshToken();
      await api.post(API_PATHS.logout, refreshToken ? { refreshToken } : {}).catch(() => undefined);
      await session.end();
    },
  };
}

export type DashboardClient = ReturnType<typeof createDashboardClient>;
