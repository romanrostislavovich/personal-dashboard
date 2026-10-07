import { FAILURES_TO_GO_DOWN } from './monitor-state';

/** A time a site was down: from its first failed check to the first successful one after. */
export interface Incident {
  from: Date;
  /** `null` — still down. */
  to: Date | null;
  failedChecks: number;
}

/**
 * The incidents in a history of checks (oldest first): a run of failed checks long enough to
 * be declared "down" — a single failed check is a hiccup of the network, as for the alerts.
 */
export function incidentsOf(checks: { checkedAt: Date; isUp: boolean }[]): Incident[] {
  const incidents: Incident[] = [];
  let run: { from: Date; failedChecks: number } | null = null;
  const close = (to: Date | null) => {
    if (run && run.failedChecks >= FAILURES_TO_GO_DOWN) {
      incidents.push({ ...run, to });
    }
    run = null;
  };
  for (const check of checks) {
    if (check.isUp) {
      close(check.checkedAt);
    } else if (run) {
      run.failedChecks += 1;
    } else {
      run = { from: check.checkedAt, failedChecks: 1 };
    }
  }
  close(null);
  return incidents;
}
