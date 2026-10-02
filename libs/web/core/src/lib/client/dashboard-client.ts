import { InjectionToken } from '@angular/core';
import { browserStorage, createDashboardClient, DashboardClient } from '@pd/client-core';

/**
 * The client core (`@pd/client-core`) for the web app: the API on the same origin, the session in
 * `localStorage`. Every request is defined in the core. Angular services wrap it: writes go
 * through the core (`fromCore`), reads through `httpResource` with the core's `{ url, params }`
 * — `HttpClient`'s interceptor takes the token from the same session.
 */
export const DASHBOARD_CLIENT = new InjectionToken<DashboardClient>('DashboardClient', {
  providedIn: 'root',
  factory: () => {
    forgetLegacyToken();
    return createDashboardClient({
      baseUrl: '',
      storage: browserStorage(),
      // The refresh token stays in an httpOnly cookie: page scripts (an XSS) cannot read it.
      refreshTokenIn: 'cookie',
      fetch: pastServiceWorker,
    });
  },
});

/** Before sessions, a 30-day access token was kept in localStorage — readable by any script. */
function forgetLegacyToken(): void {
  try {
    localStorage.removeItem('pd.accessToken');
  } catch {
    // Storage is blocked: nothing was kept there either.
  }
}

/**
 * The service worker saves answers of the API for offline use; the stream of live events is
 * not an answer to save, so it goes around the worker (`ngsw-bypass`).
 */
const pastServiceWorker: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return url.includes('/api/events')
    ? fetch(input, {
        ...init,
        headers: { ...(init?.headers as Record<string, string>), 'ngsw-bypass': 'true' },
      })
    : fetch(input, init);
};
