import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WindowSample } from './span-builder';
import { TELEMETRY_INGEST_PATH } from '@pd/client-core';
import { ActivityTracker } from './tracker';
import type { NativeInputAggregate } from './input-dynamics';
import type { TerminalReport } from './telemetry-sources';

const env = vi.hoisted(() => ({
  sample: (_sample: WindowSample | null) => undefined as void,
  events: new Map<string, () => void>(),
  idle: 0,
  fetch: vi.fn(),
  sourceUpdate: vi.fn(),
  sourceStop: vi.fn(),
  input: (_aggregate: NativeInputAggregate) => undefined as void,
  terminal: (_report: TerminalReport) => undefined as void,
}));

vi.mock('./telemetry-sources', () => ({
  TelemetrySources: class {
    constructor(input: typeof env.input, terminal: typeof env.terminal) {
      env.input = input;
      env.terminal = terminal;
    }
    update = env.sourceUpdate;
    stop = env.sourceStop;
    status = () => 'running';
  },
}));

vi.mock('electron', () => ({
  net: { fetch: env.fetch },
  powerMonitor: {
    getSystemIdleTime: () => env.idle,
    on: (event: string, fn: () => void) => env.events.set(event, fn),
  },
}));
vi.mock('./window-watcher', () => ({
  SAMPLE_SECONDS: 5,
  WindowWatcher: class {
    static supported = true;
    constructor(sample: typeof env.sample) {
      env.sample = sample;
    }
    start = vi.fn();
    stop = vi.fn();
  },
}));
vi.mock('./health', () => ({
  HealthCollector: class {
    async collect() {
      return null;
    }
  },
}));
vi.mock('./outages', () => ({
  OutageWatch: class {
    forget = vi.fn();
    succeeded = vi.fn();
    failed = vi.fn();
  },
}));
vi.mock('./activity-store', () => ({
  ActivityStore: class {
    deviceId: string | null = 'device-one';
    token: string | null = 'device-token';
    pausedUntil: number | null = null;
    queue = [];
    focusQueue = [];
    outageQueue = [];
    config = {
      idleMinutes: 5,
      excludedApps: ['excluded'],
      privateWords: ['confidential'],
      watchApps: ['player'],
      breakMinutes: 0,
      distractingApps: [],
      meetingApps: [],
      focus: { roundsBeforeLongBreak: 4 },
    };
    setDevice(device: { id: string; token: string } | null) {
      this.deviceId = device?.id ?? null;
      this.token = device?.token ?? null;
    }
    setPausedUntil(until: number | null) {
      this.pausedUntil = until;
    }
    enqueue = vi.fn();
    dequeue = vi.fn();
    dequeueFocus = vi.fn();
    dequeueOutages = vi.fn();
    flush = vi.fn();
  },
}));

const windowSample = (app = 'editor', title = 'Document'): WindowSample => ({
  app,
  title,
  name: null,
  fullscreen: false,
});
const telemetryCalls = () =>
  env.fetch.mock.calls.filter(([url]) => new URL(url).pathname === TELEMETRY_INGEST_PATH);

describe('ActivityTracker telemetry integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    env.events.clear();
    env.idle = 0;
    env.sourceUpdate.mockClear();
    env.sourceStop.mockClear();
    env.fetch
      .mockReset()
      .mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  async function watch(sample: WindowSample | null, duration = 360_000) {
    for (let elapsed = 0; elapsed < duration; elapsed += 5000) {
      env.sample(sample);
      await vi.advanceTimersByTimeAsync(5000);
    }
  }

  it('is off by default even when activity tracking is enabled', async () => {
    const tracker = new ActivityTracker(() => 'https://dashboard.example.com', vi.fn(), vi.fn());
    tracker.start();
    await watch(windowSample());
    expect(telemetryCalls()).toHaveLength(0);
    expect(tracker.observeInput('input', 'public-editable')).toBe(false);
    expect(env.sourceUpdate.mock.calls.every(([gate]) => gate === null)).toBe(true);
  });

  it('tells why the telemetry is off, without secrets', async () => {
    let consent = false;
    const tracker = new ActivityTracker(
      () => 'https://dashboard.example.com',
      vi.fn(),
      vi.fn(),
      () => consent,
    );
    tracker.start();
    await watch(windowSample(), 10_000);
    expect(tracker.telemetryDiagnostics('1.2.3')).toMatchObject({
      collection: 'consent-required',
      registered: true,
      version: '1.2.3',
      delivery: 'never',
    });

    consent = true;
    await watch(windowSample());
    const collecting = tracker.telemetryDiagnostics(null);
    expect(collecting).toMatchObject({
      collection: 'collecting',
      delivery: 'accepted',
      lastHttpStatus: 200,
    });
    expect(JSON.stringify(collecting)).not.toMatch(/device-token|Document|editor/);

    await watch(windowSample('browser', 'confidential plan'), 10_000);
    expect(tracker.telemetryDiagnostics(null).collection).toBe('private-window');
    await watch(windowSample('excluded'), 10_000);
    expect(tracker.telemetryDiagnostics(null).collection).toBe('excluded-app');
    env.idle = 600;
    expect(tracker.telemetryDiagnostics(null).collection).toBe('idle');
  });

  it('uses real tracker samples, the shared endpoint and Device authentication', async () => {
    const tracker = new ActivityTracker(
      () => 'https://dashboard.example.com',
      vi.fn(),
      vi.fn(),
      () => true,
    );
    tracker.start();
    await watch(windowSample());
    const calls = telemetryCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][1].headers.Authorization).toBe('Device device-token');
    const body = JSON.parse(calls[0][1].body);
    expect(body.buckets).toHaveLength(5);
    expect(body.buckets[0].metrics.focusSeconds).toBe(60);
    expect(calls[0][1].body).not.toMatch(/Document|editor|device-token/);
    expect(body.buckets[0].metrics).not.toHaveProperty('inputCount');
  });

  it.each([
    'paused',
    'locked',
    'suspend',
    'private',
    'private-word',
    'excluded',
    'idle',
    'unknown',
    'disabled',
    'revoked',
  ])('discards buffered data when %s', async (reason) => {
    let consent = true;
    const tracker = new ActivityTracker(
      () => 'https://dashboard.example.com',
      vi.fn(),
      vi.fn(),
      () => consent,
    );
    tracker.start();
    await watch(windowSample(), 65_000);
    let sample: WindowSample | null = windowSample();
    if (reason === 'paused') tracker.pause(0);
    if (reason === 'locked') env.events.get('lock-screen')?.();
    if (reason === 'suspend') {
      env.events.get('suspend')?.();
    }
    if (reason === 'private') sample = windowSample('browser', 'Incognito');
    if (reason === 'private-word') sample = windowSample('editor', 'confidential');
    if (reason === 'excluded') sample = windowSample('excluded');
    if (reason === 'idle') {
      env.idle = 301;
      sample = { ...windowSample('player'), fullscreen: true };
    }
    if (reason === 'unknown') sample = null;
    if (reason === 'disabled') tracker.disable();
    if (reason === 'revoked') consent = false;
    await watch(sample);
    expect(tracker.observeInput('input', 'public-editable')).toBe(false);
    expect(telemetryCalls()).toHaveLength(0);
    expect(env.sourceUpdate).toHaveBeenLastCalledWith(null);
  });

  it('connects native aggregates and reports, emitting only accepted successful test/commit events', async () => {
    const successful = vi.fn();
    const tracker = new ActivityTracker(
      () => 'https://dashboard.example.com',
      vi.fn(),
      vi.fn(),
      () => true,
      successful,
    );
    tracker.start();
    env.sample(windowSample());
    expect(env.sourceUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ idleMs: 300_000 }));
    await watch(windowSample(), 5000);
    env.input({
      inputCount: 12,
      backspaceCount: 2,
      backspaceBursts: 1,
      pauses: 1,
      pauseMeanMs: 2000,
      pauseM2: 0,
    });
    env.terminal({ category: 'test', durationMs: 1000, exitCode: 1 });
    env.terminal({ category: 'build', durationMs: 1000, exitCode: 0 });
    env.terminal({ category: 'test', durationMs: 1000, exitCode: 0 });
    env.terminal({ category: 'commit', durationMs: 1000, exitCode: 0 });
    env.terminal({ category: 'test', durationMs: 6000, exitCode: 0 });
    expect(successful.mock.calls.map(([event]) => event.category)).toEqual(['test', 'commit']);
    expect(successful.mock.calls[0][0]).toEqual({
      category: 'test',
      durationMs: 1000,
      completedAt: 5000,
    });
    await watch(windowSample(), 300_000);
    const metrics = JSON.parse(telemetryCalls()[0][1].body).buckets[0].metrics;
    expect(metrics).toMatchObject({
      inputCount: 12,
      backspaceCount: 2,
      terminalCommands: 4,
      terminalFailures: 1,
      buildWaitMs: 1000,
    });
    tracker.pause(0);
    expect(env.sourceStop).toHaveBeenCalled();
    env.terminal({ category: 'commit', durationMs: 0, exitCode: 0 });
    expect(successful).toHaveBeenCalledTimes(2);
    await tracker.stop();
  });

  it('stops sources on stale samples and rejects a completion across an identity change', async () => {
    let server = 'https://one.example.com';
    const successful = vi.fn();
    const tracker = new ActivityTracker(
      () => server,
      vi.fn(),
      vi.fn(),
      () => true,
      successful,
    );
    tracker.start();
    env.sample(windowSample());
    await vi.advanceTimersByTimeAsync(11_000);
    expect(env.sourceUpdate).toHaveBeenLastCalledWith(null);
    env.terminal({ category: 'test', durationMs: 1000, exitCode: 0 });
    expect(successful).not.toHaveBeenCalled();
    env.sample(windowSample());
    server = 'https://two.example.com';
    env.terminal({ category: 'commit', durationMs: 0, exitCode: 0 });
    expect(successful).not.toHaveBeenCalled();
    expect(env.sourceUpdate).toHaveBeenLastCalledWith(null);
    await tracker.stop();
  });

  it('drops old-server and old-device buckets and stops telemetry on shutdown', async () => {
    let server = 'https://one.example.com';
    const tracker = new ActivityTracker(
      () => server,
      vi.fn(),
      vi.fn(),
      () => true,
    );
    tracker.start();
    await watch(windowSample(), 65_000);
    server = 'https://two.example.com';
    tracker.enable({ id: 'device-two', token: 'new-token' });
    await watch(windowSample());
    const calls = telemetryCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(`https://two.example.com${TELEMETRY_INGEST_PATH}`);
    expect(calls[0][1].headers.Authorization).toBe('Device new-token');
    expect(
      JSON.parse(calls[0][1].body).buckets.every(
        (bucket: { startedAt: string }) => Date.parse(bucket.startedAt) >= 65_000,
      ),
    ).toBe(true);
    await tracker.stop();
    await watch(windowSample());
    expect(telemetryCalls()).toHaveLength(1);
    expect(tracker.observeInput('input', 'public-editable')).toBe(false);
  });

  function activeWork(minutes = 50) {
    const start = Date.now();
    for (let elapsed = 0; elapsed <= minutes * 60_000; elapsed += 5000) {
      vi.setSystemTime(start + elapsed);
      env.sample(windowSample());
    }
  }

  it('suggests a smart break only on a real accepted success callback, not on samples or timers', async () => {
    const notice = vi.fn();
    const successful = vi.fn();
    const tracker = new ActivityTracker(
      () => 'https://dashboard.example.com',
      vi.fn(),
      notice,
      () => true,
      successful,
      () => true,
    );
    tracker.start();
    env.idle = 2;
    activeWork();
    expect(notice).not.toHaveBeenCalled();
    env.terminal({ category: 'test', durationMs: 1000, exitCode: 1 });
    env.terminal({ category: 'general', durationMs: 1000, exitCode: 0 });
    env.terminal({ category: 'build', durationMs: 1000, exitCode: 0 });
    expect(notice).not.toHaveBeenCalled();
    env.terminal({ category: 'test', durationMs: 1000, exitCode: 0 });
    expect(notice).toHaveBeenCalledExactlyOnceWith({ kind: 'smart-break' });
    expect(successful).toHaveBeenCalledExactlyOnceWith({
      category: 'test',
      durationMs: 1000,
      completedAt: Date.now(),
    });
    env.terminal({ category: 'commit', durationMs: 1000, exitCode: 0 });
    activeWork(29);
    env.terminal({ category: 'commit', durationMs: 1000, exitCode: 0 });
    expect(notice).toHaveBeenCalledTimes(1);
    activeWork(1);
    env.terminal({ category: 'commit', durationMs: 1000, exitCode: 0 });
    expect(notice).toHaveBeenCalledTimes(2);
    await tracker.stop();
  });

  it('requires a separate opt-in and does not treat telemetry consent as smart-break consent', async () => {
    const notice = vi.fn();
    const tracker = new ActivityTracker(
      () => 'https://dashboard.example.com',
      vi.fn(),
      notice,
      () => true,
    );
    tracker.start();
    env.idle = 2;
    activeWork();
    env.terminal({ category: 'commit', durationMs: 0, exitCode: 0 });
    expect(notice).not.toHaveBeenCalled();
    expect(tracker.smartBreakStatus()).toEqual({ enabled: false, available: true });
    await tracker.stop();
  });

  it.each(['typing', 'focus', 'focus-break', 'meeting', 'idle'])(
    'drops the transition during %s without a deferred notification',
    async (reason) => {
      const notice = vi.fn();
      const tracker = new ActivityTracker(
        () => 'https://dashboard.example.com',
        vi.fn(),
        notice,
        () => true,
        undefined,
        () => true,
      );
      tracker.start();
      env.idle = 2;
      activeWork();
      if (reason === 'typing') env.idle = 0;
      if (reason === 'idle') env.idle = 65;
      if (reason === 'focus' || reason === 'focus-break') {
        vi.spyOn(tracker.focus, 'status').mockReturnValue({
          ...tracker.focus.status(),
          phase: reason === 'focus' ? 'focus' : 'short-break',
        });
      }
      if (reason === 'meeting') vi.spyOn(tracker, 'inMeeting', 'get').mockReturnValue(true);
      env.terminal({ category: 'test', durationMs: 1000, exitCode: 0 });
      expect(notice).not.toHaveBeenCalled();
      vi.restoreAllMocks();
      env.idle = 2;
      await watch(windowSample(), 5000);
      expect(notice).not.toHaveBeenCalled();
      await tracker.stop();
    },
  );

  it.each([
    'pause',
    'lock',
    'suspend',
    'private',
    'excluded',
    'unknown',
    'revoked',
    'telemetry-revoked',
    'server',
    'device',
    'stale',
    'clock',
    'stop',
  ])('clears smart-break work across %s', async (reason) => {
    const notice = vi.fn();
    let consent = true;
    let telemetryConsent = true;
    let server = 'https://dashboard.example.com';
    const tracker = new ActivityTracker(
      () => server,
      vi.fn(),
      notice,
      () => telemetryConsent,
      undefined,
      () => consent,
    );
    tracker.start();
    env.idle = 2;
    activeWork();
    if (reason === 'pause') tracker.pause(0);
    if (reason === 'lock') env.events.get('lock-screen')?.();
    if (reason === 'suspend') env.events.get('suspend')?.();
    if (reason === 'private') env.sample(windowSample('browser', 'Incognito'));
    if (reason === 'excluded') env.sample(windowSample('excluded'));
    if (reason === 'unknown') env.sample(null);
    if (reason === 'revoked') consent = false;
    if (reason === 'telemetry-revoked') telemetryConsent = false;
    if (reason === 'server') server = 'https://other.example.com';
    if (reason === 'device') tracker.enable({ id: 'other', token: 'other' });
    if (reason === 'stale') vi.setSystemTime(Date.now() + 11_000);
    if (reason === 'clock') vi.setSystemTime(0);
    if (reason === 'stop') await tracker.stop();
    env.terminal({ category: 'commit', durationMs: 0, exitCode: 0 });
    expect(notice).not.toHaveBeenCalled();
    tracker.pause(null);
    env.events.get('unlock-screen')?.();
    env.events.get('resume')?.();
    consent = telemetryConsent = true;
    activeWork(1);
    env.terminal({ category: 'commit', durationMs: 0, exitCode: 0 });
    expect(notice).not.toHaveBeenCalled();
    await tracker.stop();
  });

  it('resets work after sustained OS idle even when the native source is stopped', async () => {
    const notice = vi.fn();
    const tracker = new ActivityTracker(
      () => 'https://dashboard.example.com',
      vi.fn(),
      notice,
      () => true,
      undefined,
      () => true,
    );
    tracker.start();
    env.idle = 2;
    activeWork();
    for (let idle = 5; idle <= 300; idle += 5) {
      env.idle = idle;
      vi.setSystemTime(Date.now() + 5000);
      env.sample(windowSample());
    }
    env.idle = 2;
    activeWork(1);
    env.terminal({ category: 'commit', durationMs: 0, exitCode: 0 });
    expect(notice).not.toHaveBeenCalled();
    activeWork(50);
    env.terminal({ category: 'commit', durationMs: 0, exitCode: 0 });
    expect(notice).toHaveBeenCalledExactlyOnceWith({ kind: 'smart-break' });
    await tracker.stop();
  });
});
