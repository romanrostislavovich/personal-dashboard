import type { TelemetryMetrics } from '@pd/contracts';

/** Missing samples must not turn sleep, lock or a failed watcher into focus time. */
export const MAX_SAMPLE_GAP_MS = 10_000;

/** App names live only in this minute's local histogram; only numbers leave it. */
export class ContextSwitches {
  private durations = new Map<string, number>();
  private previous: { app: string; at: number } | null = null;
  private switches = 0;

  sample(app: string, at: number): void {
    const previous = this.previous;
    if (previous && at >= previous.at && at - previous.at <= MAX_SAMPLE_GAP_MS) {
      this.credit(at);
      if (app !== previous.app) this.switches++;
    }
    if (!this.durations.has(app)) this.durations.set(app, 0);
    this.previous = { app, at };
  }

  finish(at: number): TelemetryMetrics {
    const previous = this.previous;
    this.credit(at);
    // Carry only the last safe app across a bucket boundary so a switch there is not lost.
    this.previous =
      previous && at >= previous.at && at - previous.at <= MAX_SAMPLE_GAP_MS
        ? { app: previous.app, at }
        : null;
    const durations = [...this.durations.values()];
    const total = durations.reduce((sum, duration) => sum + duration, 0);
    const entropy = durations.reduce((sum, duration) => {
      const p = total ? duration / total : 0;
      return p ? sum - p * Math.log2(p) : sum;
    }, 0);
    const metrics = {
      contextSwitches: this.switches,
      focusSeconds: total / 1000,
      focusEntropy: entropy,
      uniqueApps: this.durations.size,
    };
    this.durations.clear();
    this.switches = 0;
    return metrics;
  }

  private credit(at: number): void {
    const previous = this.previous;
    if (!previous) return;
    const gap = at - previous.at;
    if (gap > 0 && gap <= MAX_SAMPLE_GAP_MS) {
      this.durations.set(previous.app, (this.durations.get(previous.app) ?? 0) + gap);
    }
  }
}
