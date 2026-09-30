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
  factory: () => createDashboardClient({ baseUrl: '', storage: browserStorage() }),
});
