import type {TelemetryMetrics} from '@pd/contracts';

/** Only a trusted, field-aware observer may report these categories, never key codes or text. */
export type SafeInputKind = 'input' | 'backspace';
export type InputFieldContext =
  'public-editable' | 'password' | 'private' | 'unknown';

/** Running moments from the native helper, never individual key events. */
export interface NativeInputAggregate {
  inputCount: number;
  backspaceCount: number;
  backspaceBursts: number;
  pauses: number;
  pauseMeanMs: number;
  pauseM2: number;
}

export function parseInputAggregate(
  value: unknown,
): NativeInputAggregate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const aggregate = value as NativeInputAggregate;
  if (
    Object.keys(aggregate).sort().join(',') !==
    'backspaceBursts,backspaceCount,inputCount,pauseM2,pauseMeanMs,pauses'
  )
    return null;
  if (
    Object.values(aggregate).some(
      n => typeof n !== 'number' || !Number.isFinite(n) || n < 0,
    )
  )
    return null;
  if (
    ['inputCount', 'backspaceCount', 'backspaceBursts', 'pauses'].some(
      key =>
        !Number.isSafeInteger(aggregate[key as keyof NativeInputAggregate]) ||
        aggregate[key as keyof NativeInputAggregate] > 1000,
    )
  )
    return null;
  if (
    aggregate.backspaceBursts > aggregate.backspaceCount ||
    aggregate.pauses > aggregate.inputCount + aggregate.backspaceCount ||
    aggregate.pauseMeanMs > 60_000 ||
    aggregate.pauseM2 > 3.6e12 ||
    (!aggregate.pauses &&
      (aggregate.pauseMeanMs !== 0 || aggregate.pauseM2 !== 0))
  )
    return null;
  return aggregate;
}

/** One minute of counts (inputCount is CPM for a full minute), without an event history. */
export class InputDynamics {
  private inputCount = 0;
  private backspaceCount = 0;
  private backspaceBursts = 0;
  private lastAt: number | null = null;
  private backspaceRun = 0;
  private pauses = 0;
  private mean = 0;
  private m2 = 0;

  merge(value: NativeInputAggregate): boolean {
    const aggregate = parseInputAggregate(value);
    if (!aggregate) return false;
    this.inputCount += aggregate.inputCount;
    this.backspaceCount += aggregate.backspaceCount;
    this.backspaceBursts += aggregate.backspaceBursts;
    if (aggregate.pauses) {
      const total = this.pauses + aggregate.pauses;
      const delta = aggregate.pauseMeanMs - this.mean;
      this.m2 +=
        aggregate.pauseM2 +
        (delta * delta * this.pauses * aggregate.pauses) / total;
      this.mean += (delta * aggregate.pauses) / total;
      this.pauses = total;
    }
    return true;
  }

  observe(kind: SafeInputKind, at: number, field: InputFieldContext): boolean {
    if (
      field !== 'public-editable' ||
      !['input', 'backspace'].includes(kind) ||
      !Number.isFinite(at) ||
      (this.lastAt !== null && at < this.lastAt)
    ) {
      this.lastAt = null;
      this.backspaceRun = 0;
      return false;
    }
    const gap = this.lastAt === null ? null : at - this.lastAt;
    // A pause is a gap of at least one second. Welford's population variance needs no samples.
    if (gap !== null && gap >= 1000 && gap <= 60_000) {
      this.pauses++;
      const delta = gap - this.mean;
      this.mean += delta / this.pauses;
      this.m2 += delta * (gap - this.mean);
    }
    if (kind === 'backspace') {
      this.backspaceCount++;
      this.backspaceRun =
        gap !== null && gap <= 1000 ? this.backspaceRun + 1 : 1;
      if (this.backspaceRun === 2) this.backspaceBursts++;
    } else {
      this.inputCount++;
      this.backspaceRun = 0;
    }
    this.lastAt = at;
    return true;
  }

  metrics(): TelemetryMetrics {
    if (!this.inputCount && !this.backspaceCount) return {};
    return {
      inputCount: this.inputCount,
      backspaceCount: this.backspaceCount,
      backspaceBursts: this.backspaceBursts,
      ...(this.pauses
        ? {
            pauseMeanMs: this.mean,
            pauseVarianceMs2: Math.max(0, this.m2 / this.pauses),
          }
        : {}),
    };
  }
}
