import { describe, expect, it } from 'vitest';
import { SmartBreak, SmartBreakSample, SMART_BREAK_WORK_MS } from './smart-break';

const active: SmartBreakSample = { allowed: true, active: true, idleMs: 2000, quiet: false };
function work(state: SmartBreak, start = 0, duration = SMART_BREAK_WORK_MS): number {
  for (let at = start; at <= start + duration; at += 5000) state.sample(at, active);
  return start + duration;
}
const event = (completedAt: number) => ({
  category: 'test' as const,
  durationMs: 1000,
  completedAt,
});

describe('SmartBreak', () => {
  it('requires fifty sampled active minutes and a successful transition, never a timer', () => {
    const state = new SmartBreak();
    const before = work(state, 0, SMART_BREAK_WORK_MS - 5000);
    expect(state.transition(event(before), before)).toBe(false);
    state.sample(before + 5000, active);
    expect(state.transition(event(before + 5000), before + 5000)).toBe(true);
    expect(state.transition(event(before + 5000), before + 5000)).toBe(false);
  });

  it('enforces thirty minutes of cooldown without pretending a suggestion was a rest', () => {
    const state = new SmartBreak();
    const first = work(state);
    expect(state.transition(event(first), first)).toBe(true);
    const before = work(state, first, 30 * 60_000 - 5000);
    expect(state.transition(event(before), before)).toBe(false);
    state.sample(before + 5000, active);
    expect(state.transition(event(before + 5000), before + 5000)).toBe(true);
  });

  it('preserves work across a short idle, but resets after actual sustained idle', () => {
    const state = new SmartBreak();
    let now = work(state);
    for (let idle = 5000; idle <= 60_000; idle += 5000) {
      state.sample(now + idle, { ...active, active: false, idleMs: idle });
    }
    now += 65_000;
    state.sample(now, active);
    expect(state.transition(event(now), now)).toBe(true);
    for (let idle = 5000; idle <= 300_000; idle += 5000) {
      state.sample(now + idle, { ...active, active: false, idleMs: idle });
    }
    now += 305_000;
    state.sample(now, active);
    expect(state.transition(event(now), now)).toBe(false);
    now = work(state, now);
    expect(state.transition(event(now), now)).toBe(true);
  });

  it.each([
    { allowed: false },
    { active: false },
    { quiet: true },
    { idleMs: 0 },
    { idleMs: Number.NaN },
  ])('rejects gated transitions without scheduling a later notification: %j', (gate) => {
    const state = new SmartBreak();
    const now = work(state);
    state.sample(now, { ...active, ...gate });
    expect(state.transition(event(now), now)).toBe(false);
    state.sample(now + 5000, active);
    expect(state.transition(event(now), now + 5000)).toBe(false);
  });

  it('clears work on pause/privacy and does not count missing samples or backward time', () => {
    const state = new SmartBreak();
    const now = work(state);
    state.clear();
    state.sample(now + 5000, active);
    expect(state.transition(event(now + 5000), now + 5000)).toBe(false);
    work(state, now + 5000);
    state.sample(now * 3, active);
    expect(state.transition(event(now * 3), now * 3)).toBe(false);
    work(state, now * 3);
    state.sample(0, active);
    expect(state.transition(event(0), 0)).toBe(false);
  });

  it('rebases cooldown after a backward clock and still requires fresh work', () => {
    const state = new SmartBreak();
    const now = work(state);
    expect(state.transition(event(now), now)).toBe(true);
    state.sample(0, active);
    const later = work(state);
    expect(state.transition(event(later), later)).toBe(true);
  });

  it('rejects stale callbacks and unsupported categories', () => {
    const state = new SmartBreak();
    const now = work(state);
    expect(state.transition({ ...event(now), category: 'build' as 'test' }, now)).toBe(false);
    expect(state.transition(event(now), now + 1)).toBe(false);
    expect(state.transition(event(now + 11_000), now + 11_000)).toBe(false);
  });
});
