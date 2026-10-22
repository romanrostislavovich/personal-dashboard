import { sanitizeTelemetryText, telemetryBucketSchema } from '@pd/contracts';
import type { DesktopTelemetryDiagnostics, TelemetryBucket } from '@pd/contracts';
import { randomUUID } from 'node:crypto';
import { ContextSwitches, MAX_SAMPLE_GAP_MS } from './context-switch';
import {
  InputDynamics,
  InputFieldContext,
  NativeInputAggregate,
  SafeInputKind,
} from './input-dynamics';
import { TerminalCompletion, TerminalFriction } from './terminal-friction';

const MINUTE_MS = 60_000;
const BATCH_MS = 5 * MINUTE_MS;

export interface TelemetryGate {
  /** Server, device and credential identity; never included in a bucket. */
  identity: string | null;
  consent: boolean;
  allowed: boolean;
}

/** Memory-only minute buckets, sent every five minutes. All ingress passes the privacy gate. */
export class DesktopTelemetry {
  private identity: string | null = null;
  private startedAt: number | null = null;
  private allowedSince: number | null = null;
  private lastSample: number | null = null;
  private nextUpload = 0;
  private input = new InputDynamics();
  private context = new ContextSwitches();
  private terminal = new TerminalFriction();
  private pending: TelemetryBucket[] = [];
  private request: AbortController | null = null;
  private lastAttemptAt: string | null = null;
  private lastSuccessAt: string | null = null;
  private lastHttpStatus: number | null = null;
  private delivery: DesktopTelemetryDiagnostics['delivery'] = 'never';

  constructor(
    private readonly gate: () => TelemetryGate,
    private readonly send: (
      buckets: TelemetryBucket[],
      identity: string,
      signal: AbortSignal,
    ) => Promise<boolean>,
  ) {}

  sample(app: string | null, now: number): void {
    if (!this.check(now)) return;
    const safeApp = app && sanitizeTelemetryText(app);
    if (!safeApp) {
      this.clear();
      return;
    }
    if (
      this.lastSample !== null &&
      (now < this.lastSample || now - this.lastSample > MAX_SAMPLE_GAP_MS)
    ) {
      this.clear();
    }
    this.rotate(now);
    this.allowedSince ??= now;
    this.lastSample = now;
    this.context.sample(safeApp.toLowerCase(), now);
  }

  mergeInput(aggregate: NativeInputAggregate, now: number): boolean {
    if (!this.fresh(now)) return false;
    this.rotate(now);
    return this.input.merge(aggregate);
  }

  /** For trusted field-aware observers; the Windows bridge supplies aggregates instead. */
  observeInput(kind: SafeInputKind, field: InputFieldContext, now: number): boolean {
    if (!this.fresh(now)) return false;
    this.rotate(now);
    return this.input.observe(kind, now, field);
  }

  reportTerminal(report: TerminalCompletion, now: number): boolean {
    if (!this.fresh(now)) return false;
    this.rotate(now);
    // Do not attribute a command that began before consent or during a blocked interval.
    if (!report || report.durationMs > now - (this.allowedSince ?? now)) return false;
    return this.terminal.report(report);
  }

  async tick(now: number): Promise<void> {
    if (!this.fresh(now)) return;
    this.rotate(now);
    if (this.request || now < this.nextUpload || !this.pending.length || !this.identity) return;
    this.nextUpload = now + BATCH_MS;
    const request = new AbortController();
    this.request = request;
    const batch = this.pending.slice();
    this.lastAttemptAt = new Date(now).toISOString();
    this.lastHttpStatus = null;
    this.delivery = 'sending';
    try {
      const accepted = await this.send(batch, this.identity, request.signal);
      this.check(Date.now());
      if (this.request === request) {
        this.delivery = accepted ? 'accepted' : 'failed';
        if (accepted) {
          this.lastSuccessAt = new Date().toISOString();
          const ids = new Set(batch.map((bucket) => bucket.id));
          this.pending = this.pending.filter((bucket) => !ids.has(bucket.id));
        }
      }
    } catch {
      // No disk outbox: at most the latest five minutes survive a failed upload, in memory.
      this.check(Date.now());
      if (this.request === request) this.delivery = 'failed';
    } finally {
      if (this.request === request) this.request = null;
    }
  }

  clear(): void {
    this.request?.abort();
    this.request = null;
    if (this.delivery === 'sending') this.delivery = 'failed';
    const gate = this.gate();
    if (gate.identity !== this.identity || !gate.identity || gate.consent !== true)
      this.clearHistory();
    this.pending = [];
    this.startedAt = null;
    this.allowedSince = null;
    this.lastSample = null;
    this.nextUpload = 0;
    this.resetCollectors();
  }

  /** Account/consent/disable resets erase evidence. Ordinary idle clears buckets, not history. */
  resetDiagnostics(): void {
    this.clear();
    this.clearHistory();
  }

  recordHttpStatus(signal: AbortSignal, status: number): void {
    this.check(Date.now());
    if (this.request?.signal === signal && !signal.aborted)
      this.lastHttpStatus =
        Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
  }

  diagnostics(): Pick<
    DesktopTelemetryDiagnostics,
    'pendingBuckets' | 'lastAttemptAt' | 'lastSuccessAt' | 'lastHttpStatus' | 'delivery'
  > {
    this.fresh(Date.now());
    return {
      pendingBuckets: this.pending.length,
      lastAttemptAt: this.lastAttemptAt,
      lastSuccessAt: this.lastSuccessAt,
      lastHttpStatus: this.lastHttpStatus,
      delivery: this.delivery,
    };
  }

  private clearHistory(): void {
    this.lastAttemptAt = null;
    this.lastSuccessAt = null;
    this.lastHttpStatus = null;
    this.delivery = 'never';
  }

  private check(now: number): boolean {
    const gate = this.gate();
    if (gate.identity !== this.identity) {
      this.clear();
      this.identity = gate.identity;
    }
    if (!Number.isFinite(now) || !gate.identity || gate.consent !== true || gate.allowed !== true) {
      this.clear();
      return false;
    }
    return true;
  }

  private fresh(now: number): boolean {
    if (!this.check(now)) return false;
    if (
      this.lastSample === null ||
      now < this.lastSample ||
      now - this.lastSample > MAX_SAMPLE_GAP_MS
    ) {
      this.clear();
      return false;
    }
    return true;
  }

  private rotate(now: number): void {
    if (this.startedAt !== null && now >= this.startedAt + MINUTE_MS) {
      const end = this.startedAt + MINUTE_MS;
      const result = telemetryBucketSchema.safeParse({
        id: randomUUID(),
        source: 'desktop',
        startedAt: new Date(this.startedAt).toISOString(),
        endedAt: new Date(end).toISOString(),
        metrics: {
          ...this.input.metrics(),
          ...this.context.finish(end),
          ...this.terminal.metrics(),
        },
      });
      if (result.success) this.pending = [...this.pending, result.data].slice(-5);
      this.startedAt = end;
      this.input = new InputDynamics();
      this.terminal = new TerminalFriction();
    }
    if (this.startedAt === null) this.startedAt = now;
    if (!this.nextUpload) this.nextUpload = now + BATCH_MS;
  }

  private resetCollectors(): void {
    this.input = new InputDynamics();
    this.context = new ContextSwitches();
    this.terminal = new TerminalFriction();
  }
}
