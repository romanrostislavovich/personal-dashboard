import {MAX_SAMPLE_GAP_MS} from './context-switch';
import type {SuccessfulWorkEvent} from './telemetry-sources';

export const SMART_BREAK_WORK_MS = 50 * 60_000;
export const SMART_BREAK_COOLDOWN_MS = 30 * 60_000;
export const SMART_BREAK_REST_MS = 5 * 60_000;
export const SMART_BREAK_INPUT_QUIET_MS = 2000;

export interface SmartBreakSample {
  allowed: boolean;
  active: boolean;
  idleMs: number;
  quiet: boolean;
}

/** Local sampled activity, not a fatigue estimate. Samples never produce notifications. */
export class SmartBreak {
  private workMs = 0;
  private previous: {at: number; active: boolean} | null = null;
  private current: SmartBreakSample | null = null;
  private lastNotice: number | null = null;
  private lastTransition: number | null = null;

  /** Keep the cooldown across pauses/consent changes; never carry work across a privacy gap. */
  clear(): void {
    this.workMs = 0;
    this.previous = null;
    this.current = null;
    this.lastTransition = null;
  }

  sample(now: number, sample: SmartBreakSample): void {
    if (
      !Number.isFinite(now) ||
      !Number.isFinite(sample.idleMs) ||
      sample.idleMs < 0
    ) {
      this.clear();
      return;
    }
    if (
      (this.previous && now < this.previous.at) ||
      (this.lastNotice !== null && now < this.lastNotice)
    ) {
      this.clear();
      if (this.lastNotice !== null) this.lastNotice = now;
    }
    if (!sample.allowed) {
      this.clear();
      return;
    }
    const previous = this.previous;
    if (previous && now - previous.at > MAX_SAMPLE_GAP_MS) this.clear();
    if (sample.idleMs >= SMART_BREAK_REST_MS) this.workMs = 0;
    else if (this.previous?.active && sample.active)
      this.workMs += now - this.previous.at;
    this.previous = {at: now, active: sample.active};
    this.current = sample;
  }

  /** A missed transition is consumed, not deferred until the user starts typing again. */
  transition(event: SuccessfulWorkEvent, now: number): boolean {
    if (
      !Number.isFinite(now) ||
      event.completedAt !== now ||
      !['test', 'commit'].includes(event.category) ||
      !Number.isFinite(event.durationMs) ||
      event.durationMs < 0 ||
      event.durationMs > 300_000 ||
      (this.lastTransition !== null && event.completedAt <= this.lastTransition)
    )
      return false;
    this.lastTransition = event.completedAt;
    if (
      !this.previous ||
      now < this.previous.at ||
      now - this.previous.at > MAX_SAMPLE_GAP_MS ||
      !this.current?.allowed ||
      !this.current.active ||
      this.current.quiet ||
      this.current.idleMs < SMART_BREAK_INPUT_QUIET_MS ||
      this.workMs < SMART_BREAK_WORK_MS ||
      (this.lastNotice !== null &&
        now - this.lastNotice < SMART_BREAK_COOLDOWN_MS)
    )
      return false;
    this.lastNotice = now;
    return true;
  }
}
