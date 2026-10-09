import { IntegrationState, IntegrationStatus } from '@pd/contracts';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** A token that expires within this long is told about: time enough to renew it. */
export const EXPIRING_DAYS = 14;
/** Without a threshold of its own, a connection is stale after two days without a refresh. */
export const DEFAULT_STALE_HOURS = 48;

/** A connection as its section reports it (see IntegrationSource). */
export interface IntegrationReport {
  /** Under the source's id when it has several connections (`development.code.gitlab`). */
  key?: string;
  name: string;
  detail?: string | null;
  /** `undefined` — it does not refresh by itself, so it cannot be stale. */
  lastSyncedAt?: Date | null;
  error?: string | null;
  expiresAt?: Date | null;
}

/**
 * The state of a connection, the worst first: a token that has expired explains an error, an
 * error explains a refresh that is late.
 */
export function stateOf(
  report: IntegrationReport,
  staleHours: number,
  now: Date,
): IntegrationState {
  const expiresIn = report.expiresAt ? report.expiresAt.getTime() - now.getTime() : null;
  if (expiresIn !== null && expiresIn <= 0) {
    return 'expired';
  }
  if (report.error) {
    return 'error';
  }
  if (expiresIn !== null && expiresIn <= EXPIRING_DAYS * DAY_MS) {
    return 'expiring';
  }
  // Never refreshed yet is not stale: the first refresh is on its way.
  if (report.lastSyncedAt && now.getTime() - report.lastSyncedAt.getTime() > staleHours * HOUR_MS) {
    return 'stale';
  }
  return 'ok';
}

/** What to tell the user about: the connections whose trouble is new since the last time. */
export function newTroubles(
  statuses: Pick<IntegrationStatus, 'id' | 'state'>[],
  told: ReadonlyMap<string, IntegrationState>,
): { tell: string[]; forget: string[] } {
  const tell = statuses
    .filter((status) => status.state !== 'ok' && told.get(status.id) !== status.state)
    .map((status) => status.id);
  // Back in order, or disconnected: the next trouble is told again.
  const troubled = new Set(statuses.filter((s) => s.state !== 'ok').map((s) => s.id));
  const forget = [...told.keys()].filter((id) => !troubled.has(id));
  return { tell, forget };
}
