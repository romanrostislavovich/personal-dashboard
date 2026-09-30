import { CurrentUser, LoginRequest, RegisterRequest } from '@pd/contracts';
import { ApiClient } from './api-client';
import { authApi, projectsApi } from './core-api';
import { ClientPlatform } from './platform';
import { RealtimeConnection } from './realtime';
import { Session } from './session';

/**
 * Everything a client needs from the core, wired together. A platform creates it once:
 *
 * ```ts
 * const client = createDashboardClient({ baseUrl: '', storage: browserStorage() });
 * await client.restoreSession();
 * ```
 */
export function createDashboardClient(platform: ClientPlatform) {
  const session = new Session(platform.storage);
  const api = new ApiClient(platform, session);
  const auth = authApi(api);
  const realtime = new RealtimeConnection(api, session, platform.fetch);

  return {
    session,
    api,
    auth,
    projects: projectsApi(api),
    realtime,

    /** Signs in and starts the session; returns the user. */
    async signIn(credentials: LoginRequest): Promise<CurrentUser> {
      const { accessToken, user } = await auth.login(credentials);
      await session.start(accessToken);
      return user;
    },

    async signUp(input: RegisterRequest): Promise<CurrentUser> {
      const { accessToken, user } = await auth.register(input);
      await session.start(accessToken);
      return user;
    },

    /**
     * On app start: the saved token and the user it belongs to; `null` when signed out or the
     * token no longer works (the session is ended then).
     */
    async restoreSession(): Promise<CurrentUser | null> {
      if (!(await session.restore())) {
        return null;
      }
      try {
        return await auth.me();
      } catch {
        await session.end();
        return null;
      }
    },

    signOut: () => session.end(),
  };
}

export type DashboardClient = ReturnType<typeof createDashboardClient>;
