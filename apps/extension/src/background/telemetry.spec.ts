import { vi } from 'vitest';
import {
  excludeTelemetrySite,
  invalidateEngagement,
  receiveEngagement,
  scheduleTelemetry,
  setTelemetryConsent,
  telemetrySettings,
  uploadTelemetry,
} from './telemetry';
import { clearTelemetryConsent, telemetryExclusive } from './telemetry-state';

const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  user: 'user-1',
  server: 'https://dashboard.example.com',
  signedIn: true,
}));
vi.mock('./account', () => ({
  signedInClient: async () => {
    if (!mocks.signedIn) throw new Error('signed-out');
    return { api: { post: mocks.record }, offlineUser: async () => ({ id: mocks.user }) };
  },
  serverUrl: async () => mocks.server,
}));

let local: Record<string, unknown>;
let session: Record<string, unknown>;
let tab: chrome.tabs.Tab;
let sender: chrome.runtime.MessageSender;
let idle: string;
let focused: boolean;
function area(values: Record<string, unknown>) {
  return {
    get: async (keys: string | string[]) =>
      Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, values[key]])),
    set: async (entries: Record<string, unknown>) => {
      Object.assign(values, structuredClone(entries));
    },
    remove: async (key: string) => {
      delete values[key];
    },
  };
}
async function collect() {
  const permission = await receiveEngagement({}, sender);
  vi.advanceTimersByTime(15_000);
  await receiveEngagement(
    {
      lease: permission?.lease,
      readingSeconds: 10,
      copyCount: 2,
      scrollDepthPercent: 50,
      url: 'https://evil.example',
      title: 'private',
      metadata: { type: 'article', technologies: ['React', 'Jane Doe'] },
    },
    sender,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
  local = {};
  session = {};
  idle = 'active';
  focused = true;
  mocks.user = 'user-1';
  mocks.server = 'https://dashboard.example.com';
  mocks.signedIn = true;
  mocks.record.mockReset().mockResolvedValue({ saved: 1 });
  tab = {
    id: 1,
    windowId: 2,
    active: true,
    incognito: false,
    url: 'https://docs.example.com/guide?token=hidden#secret',
  } as chrome.tabs.Tab;
  sender = {
    id: 'extension',
    frameId: 0,
    documentId: 'doc-1',
    tab,
    url: tab.url,
    origin: 'https://docs.example.com',
  };
  vi.stubGlobal('chrome', {
    runtime: { id: 'extension' },
    extension: { inIncognitoContext: false },
    storage: { local: area(local), session: area(session) },
    tabs: { get: async () => tab, query: async () => [tab], sendMessage: async () => undefined },
    windows: { get: async () => ({ focused }) },
    idle: { queryState: async () => idle },
    alarms: {
      get: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(undefined),
    },
  });
  invalidateEngagement();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('telemetry buffering and consent', () => {
  it('defaults off and starts a five-minute alarm without resetting an existing one', async () => {
    expect(await telemetrySettings()).toEqual({ enabled: false, excluded: false });
    await collect();
    expect(session).toEqual({});
    await scheduleTelemetry();
    expect(chrome.alarms.create).toHaveBeenCalledWith('engagement-upload', {
      delayInMinutes: 5,
      periodInMinutes: 5,
    });
    vi.mocked(chrome.alarms.get).mockResolvedValue({ name: 'engagement-upload', scheduledTime: 0 });
    await scheduleTelemetry();
    expect(chrome.alarms.create).toHaveBeenCalledTimes(1);
  });

  it('persists sanitized aggregates only, retries the same IDs and clears on success', async () => {
    await setTelemetryConsent(true);
    await collect();
    const saved = JSON.stringify(session);
    expect(saved).not.toMatch(/hidden|secret|private|Jane Doe|evil/);
    mocks.record.mockRejectedValueOnce(new Error('offline'));
    await expect(uploadTelemetry()).rejects.toThrow('offline');
    expect(JSON.stringify(session)).toBe(saved);
    await uploadTelemetry();
    expect(mocks.record.mock.calls[0]).toEqual(mocks.record.mock.calls[1]);
    expect(mocks.record.mock.calls[1][0]).toBe('/api/activity/telemetry');
    expect(mocks.record.mock.calls[1][1].buckets[0].page).toEqual({
      url: 'https://docs.example.com/guide',
      type: 'article',
      technologies: ['React'],
    });
    expect(session).toEqual({});
  });

  it('opt-out clears the queue and prevents replay after renewed consent', async () => {
    await setTelemetryConsent(true);
    const permission = await receiveEngagement({}, sender);
    await collect();
    await setTelemetryConsent(false);
    expect(session).toEqual({});
    expect(await receiveEngagement({}, sender)).toBeNull();
    await setTelemetryConsent(true);
    vi.advanceTimersByTime(15_000);
    await receiveEngagement({ lease: permission?.lease, readingSeconds: 10, copyCount: 1 }, sender);
    await uploadTelemetry();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it.each(['account', 'server', 'signed-out'])(
    'discards queued data on %s change',
    async (change) => {
      await setTelemetryConsent(true);
      await collect();
      if (change === 'account') mocks.user = 'user-2';
      if (change === 'server') mocks.server = 'https://another.example.com';
      if (change === 'signed-out') mocks.signedIn = false;
      await uploadTelemetry();
      expect(session).toEqual({});
      expect(local['telemetryConsent']).toBeUndefined();
      expect(mocks.record).not.toHaveBeenCalled();
    },
  );

  it('serializes an account transition behind an in-flight upload', async () => {
    await setTelemetryConsent(true);
    await collect();
    let finish!: () => void;
    let started!: () => void;
    const sending = new Promise<void>((resolve) => {
      started = resolve;
    });
    mocks.record.mockImplementationOnce(() => {
      started();
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    const upload = uploadTelemetry();
    await sending;
    const transition = telemetryExclusive(async () => {
      await clearTelemetryConsent();
      mocks.user = 'user-2';
    });
    expect(mocks.user).toBe('user-1');
    finish();
    await upload;
    await transition;
    expect(mocks.user).toBe('user-2');
    expect(session).toEqual({});
  });

  it.each([
    'incognito',
    'idle',
    'unfocused',
    'excluded',
    'private',
    'never-save',
    'subframe',
    'origin',
  ])('denies %s pages', async (reason) => {
    await setTelemetryConsent(true);
    if (reason === 'incognito') tab.incognito = true;
    if (reason === 'idle') idle = 'idle';
    if (reason === 'unfocused') focused = false;
    if (reason === 'excluded') await excludeTelemetrySite(String(tab.url), true);
    if (reason === 'private') local['browserConfig'] = { privateWords: ['docs'] };
    if (reason === 'never-save') local['neverSave'] = ['example.com'];
    if (reason === 'subframe') sender.frameId = 1;
    if (reason === 'origin') sender.origin = 'https://evil.example';
    expect(await receiveEngagement({}, sender)).toBeNull();
    await uploadTelemetry();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('discards interrupted, expired or pre-suspension leases', async () => {
    await setTelemetryConsent(true);
    const permission = await receiveEngagement({}, sender);
    invalidateEngagement();
    vi.advanceTimersByTime(15_000);
    await receiveEngagement({ lease: permission?.lease, readingSeconds: 10, copyCount: 1 }, sender);
    const next = await receiveEngagement({}, sender);
    vi.advanceTimersByTime(30_000);
    await receiveEngagement({ lease: next?.lease, readingSeconds: 10, copyCount: 1 }, sender);
    await uploadTelemetry();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('rechecks exclusions before uploading already queued aggregates', async () => {
    await setTelemetryConsent(true);
    await collect();
    local['browserConfig'] = { privateWords: ['docs'] };
    await uploadTelemetry();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('restores the bounded queue but not raw leases after a worker restart', async () => {
    await setTelemetryConsent(true);
    await collect();
    const permission = await receiveEngagement({}, sender);
    const queued = structuredClone(session['telemetryQueue']);
    vi.resetModules();
    const restarted = await import('./telemetry');
    vi.advanceTimersByTime(15_000);
    await restarted.receiveEngagement(
      { lease: permission?.lease, readingSeconds: 10, copyCount: 1 },
      sender,
    );
    expect(session['telemetryQueue']).toEqual(queued);
    await restarted.uploadTelemetry();
    expect(mocks.record.mock.calls[0][1].buckets).toHaveLength(1);
    expect(session).toEqual({});
  });

  it.each([NaN, Infinity, -1, 16])(
    'rejects invalid reading duration %s',
    async (readingSeconds) => {
      await setTelemetryConsent(true);
      const permission = await receiveEngagement({}, sender);
      vi.advanceTimersByTime(15_000);
      await receiveEngagement(
        { lease: permission?.lease, readingSeconds, scrollDepthPercent: 50, copyCount: 1 },
        sender,
      );
      await uploadTelemetry();
      expect(mocks.record).not.toHaveBeenCalled();
    },
  );
});
