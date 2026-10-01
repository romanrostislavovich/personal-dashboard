const HOUR_MS = 60 * 60 * 1000;

/** The same problem is told about once in this long. */
const SAME_PROBLEM_MS = 6 * HOUR_MS;
/** Whatever breaks, no more messages than this an hour. */
const MAX_PER_HOUR = 5;

/**
 * Decides whether a problem is worth a message right now. A failing job fails every run, and a
 * broken deploy produces dozens of different errors at once — neither should flood Telegram.
 */
export class NotifyThrottle {
  private readonly lastSent = new Map<string, number>();
  private recent: number[] = [];

  /** `true` — send it (and count it as sent). */
  allow(problem: string, now: number = Date.now()): boolean {
    this.recent = this.recent.filter((at) => now - at < HOUR_MS);
    const last = this.lastSent.get(problem);
    if (
      (last !== undefined && now - last < SAME_PROBLEM_MS) ||
      this.recent.length >= MAX_PER_HOUR
    ) {
      return false;
    }
    this.lastSent.set(problem, now);
    this.recent.push(now);
    return true;
  }
}
