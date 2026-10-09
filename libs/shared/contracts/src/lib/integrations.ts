/**
 * How a connection to an outside service is doing:
 * - `ok` — it refreshed lately and without an error;
 * - `error` — its last refresh failed (a rejected token, a service that is down);
 * - `stale` — it has not refreshed for longer than it should;
 * - `expiring` — its token expires within two weeks;
 * - `expired` — its token has expired.
 */
export const INTEGRATION_STATES = ['ok', 'error', 'stale', 'expiring', 'expired'] as const;
export type IntegrationState = (typeof INTEGRATION_STATES)[number];

/** One connection of the user, as "Settings → Integrations" lists it. */
export interface IntegrationStatus {
  /** `development.github`: stable, the section's id first. */
  id: string;
  module: string;
  /** The service's own name (GitHub, Last.fm): not translated. */
  name: string;
  /** What is connected: the account, the number of repositories. */
  detail: string | null;
  state: IntegrationState;
  /** `null` — it does not refresh by itself (a bot, an AI connection), or never did yet. */
  lastSyncedAt: string | null;
  error: string | null;
  /** When its token expires; `null` — it does not, or the service does not tell. */
  expiresAt: string | null;
}
