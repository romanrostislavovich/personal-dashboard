import { net } from 'electron';
import { randomUUID } from 'node:crypto';

/** A time the server could not be reached (activityOutageSchema in contracts). */
export interface Outage {
  id: string;
  kind: 'internet' | 'server';
  startedAt: string;
  endedAt: string;
}

/** Windows asks this address itself to tell whether there is internet at all. */
const INTERNET_CHECK = 'http://www.msftconnecttest.com/connecttest.txt';
const CHECK_TIMEOUT_MS = 5000;

/**
 * Follows the uploads of the tracker: from the first one that fails to the first that works
 * again is an outage. Whether the internet was down or only the server is told by the check
 * Windows uses itself. Precise to the minute of the uploads; a sleeping computer is not down.
 */
export class OutageWatch {
  private open: { kind: Outage['kind']; startedAt: number } | null = null;

  constructor(private readonly closed: (outage: Outage) => void) {}

  async failed(): Promise<void> {
    if (!this.open) {
      this.open = { kind: (await internetWorks()) ? 'server' : 'internet', startedAt: Date.now() };
    }
  }

  succeeded(): void {
    if (this.open) {
      this.closed({
        id: randomUUID(),
        kind: this.open.kind,
        startedAt: new Date(this.open.startedAt).toISOString(),
        endedAt: new Date().toISOString(),
      });
      this.open = null;
    }
  }

  /** The computer goes to sleep: no outage is going on while it sleeps. */
  forget(): void {
    this.open = null;
  }
}

async function internetWorks(): Promise<boolean> {
  try {
    const response = await net.fetch(INTERNET_CHECK, {
      cache: 'no-store',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    return response.ok && (await response.text()).includes('Microsoft Connect Test');
  } catch {
    return false;
  }
}
