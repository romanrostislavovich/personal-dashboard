import {vi} from 'vitest';
import {setupEngagement} from './engagement';

let events: Map<string, EventListener>;
let messages: ReturnType<typeof vi.fn>;
let reset: (message: unknown) => void;

beforeEach(() => {
  vi.useFakeTimers();
  events = new Map();
  messages = vi.fn().mockResolvedValue({ok: true, value: {lease: 'lease'}});
  vi.stubGlobal('chrome', {
    extension: {inIncognitoContext: false},
    runtime: {
      sendMessage: messages,
      onMessage: {
        addListener: (listener: typeof reset) => {
          reset = listener;
        },
      },
    },
  });
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(document, 'addEventListener').mockImplementation(
    (name, listener) => {
      events.set(name, listener as EventListener);
    },
  );
  vi.spyOn(window, 'addEventListener').mockImplementation((name, listener) => {
    events.set(name, listener as EventListener);
  });
  document.body.innerHTML = '<input value="never read this"><p>Article</p>';
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function input(
  name: string,
  target: EventTarget = document.body,
  trusted = true,
) {
  const event = {
    isTrusted: trusted,
    target,
    get clipboardData() {
      throw new Error('Clipboard must not be read');
    },
    get key() {
      throw new Error('Keys must not be read');
    },
  } as unknown as Event;
  events.get(name)?.(event);
}

describe('content engagement collector', () => {
  it('collects nothing and does not inspect metadata without consent', async () => {
    messages.mockResolvedValue({ok: true, value: null});
    setupEngagement();
    const metadata = vi.spyOn(document, 'querySelector');
    await vi.advanceTimersByTimeAsync(5000);
    input('pointerdown');
    input('copy');
    await vi.advanceTimersByTimeAsync(15_000);
    expect(messages.mock.lastCall?.[0].report).toEqual({
      readingSeconds: 0,
      scrollDepthPercent: 0,
      copyCount: 0,
    });
    expect(metadata).not.toHaveBeenCalled();
  });

  it('counts trusted copy events without accessing payloads, selection or form text', async () => {
    setupEngagement();
    vi.spyOn(document, 'getSelection').mockImplementation(() => {
      throw new Error('Selection must not be read');
    });
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(1000);
    input('pointerdown');
    await vi.advanceTimersByTimeAsync(1000);
    input('copy');
    input('copy', document.body, false);
    await vi.advanceTimersByTimeAsync(13_000);
    expect(messages.mock.lastCall?.[0].report).toMatchObject({
      readingSeconds: 14,
      copyCount: 1,
    });
    expect(JSON.stringify(messages.mock.calls)).not.toContain(
      'never read this',
    );
  });

  it('ignores form input and discards counters on blur or opt-out', async () => {
    setupEngagement();
    await vi.advanceTimersByTimeAsync(5000);
    input('keydown', document.querySelector('input') as HTMLInputElement);
    input('copy', document.querySelector('input') as HTMLInputElement);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(messages.mock.lastCall?.[0].report).toMatchObject({
      readingSeconds: 0,
      copyCount: 0,
    });
    input('copy');
    input('blur', window);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(messages.mock.lastCall?.[0].report).toMatchObject({
      readingSeconds: 0,
      copyCount: 0,
    });
    input('copy');
    reset({type: 'telemetry-reset'});
    await vi.advanceTimersByTimeAsync(15_000);
    expect(messages.mock.lastCall?.[0].report).toMatchObject({
      readingSeconds: 0,
      copyCount: 0,
    });
  });

  it('does not install collection in incognito', async () => {
    chrome.extension.inIncognitoContext = true;
    setupEngagement();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(events.size).toBe(0);
    expect(messages).not.toHaveBeenCalled();
  });
});
