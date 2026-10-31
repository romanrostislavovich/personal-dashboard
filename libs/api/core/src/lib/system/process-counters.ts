/** How many request durations are kept for the percentile: the latest ones. */
const DURATIONS_KEPT = 1000;

/**
 * Counters of this process since it started (Settings → System → Metrics): HTTP requests and
 * background job runs. In memory only — a restart starts them again, which the page says.
 */
export class ProcessCounters {
  readonly startedAt = new Date();
  requests = 0;
  serverErrors = 0;
  jobRuns = 0;
  jobFailures = 0;
  private readonly durations: number[] = [];

  request(status: number, durationMs: number): void {
    this.requests++;
    if (status >= 500) {
      this.serverErrors++;
    }
    this.durations.push(durationMs);
    if (this.durations.length > DURATIONS_KEPT) {
      this.durations.shift();
    }
  }

  job(failed: boolean): void {
    this.jobRuns++;
    if (failed) {
      this.jobFailures++;
    }
  }

  /** The 95th percentile of the latest request durations; `null` — none yet. */
  p95(): number | null {
    if (!this.durations.length) {
      return null;
    }
    const sorted = [...this.durations].sort((a, b) => a - b);
    return sorted[
      Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
    ];
  }
}

/** One per process: the HTTP middleware and the job runner count into it. */
export const processCounters = new ProcessCounters();
