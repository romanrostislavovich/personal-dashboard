import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { telemetryBucketSchema } from '@pd/contracts';
import { DesktopTelemetry, TelemetryGate } from './telemetry';

function fixture() {
  const state: TelemetryGate = { identity: 'account-one', consent: true, allowed: true };
  const send = vi.fn(async () => true);
  const telemetry = new DesktopTelemetry(() => state, send);
  const samples = (from: number, to: number) => {
    for (let at = from; at <= to; at += 5000) telemetry.sample('editor', at);
  };
  return { state, send, telemetry, samples };
}

describe('desktop telemetry batching and privacy', () => {
  it('keeps full contiguous minutes when watcher samples drift across boundaries', async () => {
    const { telemetry, send } = fixture();
    for (let at = 0; at <= 306_000; at += 5100) telemetry.sample('editor', at);
    await telemetry.tick(306_000);
    const buckets = (send.mock.calls[0] as unknown as [{ metrics: { focusSeconds: number } }[]])[0];
    expect(buckets).toHaveLength(5);
    for (const bucket of buckets) {
      expect(telemetryBucketSchema.safeParse(bucket).success).toBe(true);
      expect(bucket.metrics.focusSeconds).toBeCloseTo(60);
    }
  });

  it('counts an app switch exactly at a minute boundary in the new bucket', async () => {
    const { telemetry, send, samples } = fixture();
    samples(0, 55_000);
    for (let at = 60_000; at <= 300_000; at += 5000) telemetry.sample('browser', at);
    await telemetry.tick(300_000);
    const buckets = (
      send.mock.calls[0] as unknown as [{ metrics: { contextSwitches: number } }[]]
    )[0];
    expect(buckets[0].metrics.contextSwitches).toBe(0);
    expect(buckets[1].metrics.contextSwitches).toBe(1);
  });

  it('sends five validated one-minute buckets, no names, titles or raw input', async () => {
    const { telemetry, send, samples } = fixture();
    samples(0, 0);
    telemetry.observeInput('input', 'public-editable', 100);
    expect(telemetry.observeInput('input', 'password', 200)).toBe(false);
    samples(5000, 295_000);
    await telemetry.tick(295_000);
    expect(send).not.toHaveBeenCalled();
    samples(300_000, 300_000);
    await telemetry.tick(300_000);
    const buckets = (send.mock.calls[0] as unknown as [unknown[]])[0];
    expect(buckets).toHaveLength(5);
    for (const bucket of buckets)
      expect(telemetryBucketSchema.safeParse(bucket).success).toBe(true);
    expect(JSON.stringify(buckets)).not.toMatch(/editor|password|account-one|page|title/);
    expect(buckets[0]).toMatchObject({ metrics: { inputCount: 1, focusSeconds: 60 } });
    await telemetry.tick(300_001);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each(['consent', 'allowed'] as const)(
    'drops buffered data before accepting events when %s is false',
    async (key) => {
      const { state, telemetry, send, samples } = fixture();
      samples(0, 60_000);
      state[key] = false;
      expect(telemetry.observeInput('input', 'public-editable', 60_001)).toBe(false);
      expect(
        telemetry.reportTerminal(
          { exitCode: 1, durationMs: 0, kind: 'command', context: 'public-terminal' },
          60_002,
        ),
      ).toBe(false);
      expect(JSON.stringify(telemetry)).not.toContain('editor');
      samples(65_000, 300_000);
      await telemetry.tick(300_000);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('rejects unsafe app metadata and unknown or stale focus before buffering', () => {
    const { telemetry } = fixture();
    expect(telemetry.observeInput('input', 'public-editable', 0)).toBe(false);
    telemetry.sample('token=secret', 0);
    expect(JSON.stringify(telemetry)).not.toContain('token=secret');
    telemetry.sample('editor', 5000);
    expect(telemetry.observeInput('input', 'public-editable', 20_001)).toBe(false);
    expect(JSON.stringify(telemetry)).not.toContain('editor');
  });

  it('bounds offline memory to five buckets and preserves IDs for retry', async () => {
    const { telemetry, send, samples } = fixture();
    send.mockResolvedValue(false);
    samples(0, 300_000);
    await telemetry.tick(300_000);
    samples(305_000, 600_000);
    await telemetry.tick(600_000);
    const calls = send.mock.calls as unknown as [
      Array<{ startedAt: string }>,
      string,
      AbortSignal,
    ][];
    expect(calls[0][0]).toHaveLength(5);
    expect(calls[1][0]).toHaveLength(5);
    expect(calls[1][0].every((bucket) => Date.parse(bucket.startedAt) >= 300_000)).toBe(true);
  });

  it('cancels an in-flight batch on account changes and cannot remove new-account buckets', async () => {
    const { state, telemetry, send, samples } = fixture();
    let finish!: (ok: boolean) => void;
    send.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    samples(0, 300_000);
    const sending = telemetry.tick(300_000);
    const signal = (send.mock.calls[0] as unknown as [unknown, string, AbortSignal])[2];
    state.identity = 'account-two';
    samples(305_000, 605_000);
    expect(signal.aborted).toBe(true);
    finish(true);
    await sending;
    await telemetry.tick(605_000);
    const calls = send.mock.calls as unknown as [Array<{ startedAt: string }>, string][];
    expect(calls[1][1]).toBe('account-two');
    expect(calls[1][0]).toHaveLength(5);
    expect(calls[1][0].every((bucket) => Date.parse(bucket.startedAt) >= 305_000)).toBe(true);
  });

  it('rejects commands begun before the observed safe interval, including across a pause', () => {
    const { telemetry, state, samples } = fixture();
    const report = {
      exitCode: 0,
      durationMs: 2000,
      kind: 'build',
      context: 'public-terminal',
    } as const;
    samples(0, 0);
    expect(telemetry.reportTerminal(report, 1000)).toBe(false);
    samples(5000, 65_000);
    expect(telemetry.reportTerminal({ ...report, durationMs: 60_000 }, 65_001)).toBe(true);
    state.allowed = false;
    telemetry.sample(null, 65_002);
    state.allowed = true;
    samples(70_000, 70_000);
    expect(telemetry.reportTerminal(report, 70_001)).toBe(false);
  });
});

describe('desktop telemetry diagnostics', () => {
  // The diagnostics read the real clock: stale minutes are dropped, as everywhere else.
  beforeEach(() => vi.useFakeTimers({ now: 300_000, toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  it('tells an accepted upload, and keeps no account or app names in it', async () => {
    const { telemetry, samples } = fixture();
    expect(telemetry.diagnostics()).toMatchObject({ delivery: 'never', lastAttemptAt: null });
    samples(0, 300_000);
    await telemetry.tick(300_000);
    const diagnostics = telemetry.diagnostics();
    expect(diagnostics).toMatchObject({ delivery: 'accepted', pendingBuckets: 0 });
    expect(diagnostics.lastSuccessAt).not.toBeNull();
    expect(JSON.stringify(diagnostics)).not.toMatch(/account-one|editor/);
  });

  it('tells a failed upload and keeps the minutes for the next one', async () => {
    const { telemetry, send, samples } = fixture();
    send.mockResolvedValueOnce(false);
    samples(0, 300_000);
    await telemetry.tick(300_000);
    expect(telemetry.diagnostics()).toMatchObject({
      delivery: 'failed',
      lastSuccessAt: null,
      pendingBuckets: 5,
    });
  });

  it('forgets what it saw when the account changes', async () => {
    const { state, telemetry, samples } = fixture();
    samples(0, 300_000);
    await telemetry.tick(300_000);
    state.identity = 'account-two';
    telemetry.clear();
    expect(telemetry.diagnostics()).toMatchObject({
      delivery: 'never',
      lastAttemptAt: null,
      lastSuccessAt: null,
      pendingBuckets: 0,
    });
  });
});
