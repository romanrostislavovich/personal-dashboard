import {TelemetryBucket} from '@pd/contracts';
import {
  allowedTelemetryUrl,
  boundedTelemetryQueue,
  TELEMETRY_MAX_AGE,
  telemetrySenderAllowed,
  telemetrySettingsSenderAllowed,
} from './telemetry-gates';

const url = 'https://docs.example.com/guide?q=private#secret';
const tab = {
  id: 7,
  windowId: 2,
  active: true,
  incognito: false,
  url,
} as chrome.tabs.Tab;
const sender: chrome.runtime.MessageSender = {
  id: 'extension',
  tab,
  frameId: 0,
  documentId: 'document',
  url,
  origin: 'https://docs.example.com',
};
const now = Date.parse('2026-10-21T12:00:00Z');
const bucket = (): TelemetryBucket => ({
  id: crypto.randomUUID(),
  source: 'browser',
  startedAt: new Date(now - 15_000).toISOString(),
  endedAt: new Date(now).toISOString(),
  metrics: {readingSeconds: 10, copyCount: 1},
  page: {url: 'https://docs.example.com/guide'},
});

describe('browser telemetry privacy gates', () => {
  it('lets only the actual popup change consent, never a content script or embedded menu', () => {
    const popupUrl = 'chrome-extension://extension/popup.html';
    const popup = {id: 'extension', url: popupUrl};
    expect(telemetrySettingsSenderAllowed(popup, 'extension', popupUrl)).toBe(
      true,
    );
    expect(telemetrySettingsSenderAllowed(sender, 'extension', popupUrl)).toBe(
      false,
    );
    expect(
      telemetrySettingsSenderAllowed(
        {...popup, id: 'other'},
        'extension',
        popupUrl,
      ),
    ).toBe(false);
    expect(
      telemetrySettingsSenderAllowed(
        {...popup, url: 'chrome-extension://extension/inline-menu.html'},
        'extension',
        popupUrl,
      ),
    ).toBe(false);
    expect(
      telemetrySettingsSenderAllowed(
        {...popup, tab, frameId: 1},
        'extension',
        popupUrl,
      ),
    ).toBe(false);
    expect(
      telemetrySettingsSenderAllowed(
        {...popup, tab: {...tab, url: popupUrl}, frameId: 0},
        'extension',
        popupUrl,
      ),
    ).toBe(true);
  });

  it('requires the exact top-level document, tab and origin in the active focused window', () => {
    expect(telemetrySenderAllowed(sender, tab, 'extension', true, true)).toBe(
      true,
    );
    for (const change of [
      {id: 'other'},
      {frameId: 1},
      {documentId: undefined},
      {tab: undefined},
      {origin: 'https://evil.example'},
      {url: 'https://docs.example.com/other'},
    ]) {
      expect(
        telemetrySenderAllowed(
          {...sender, ...change},
          tab,
          'extension',
          true,
          true,
        ),
      ).toBe(false);
    }
    for (const change of [
      {id: 8},
      {active: false},
      {incognito: true},
      {url: 'file:///private'},
    ]) {
      expect(
        telemetrySenderAllowed(
          sender,
          {...tab, ...change},
          'extension',
          true,
          true,
        ),
      ).toBe(false);
    }
    expect(telemetrySenderAllowed(sender, tab, 'extension', false, true)).toBe(
      false,
    );
    expect(telemetrySenderAllowed(sender, tab, 'extension', true, false)).toBe(
      false,
    );
  });

  it('strips query/fragment and denies sensitive, local, excluded and private-word sites', () => {
    expect(allowedTelemetryUrl(url, [], [])).toBe(
      'https://docs.example.com/guide',
    );
    for (const value of [
      'http://localhost/path',
      'https://example.com/account/me',
      'file:///tmp/doc',
      'https://user:password@example.com/doc',
    ]) {
      expect(allowedTelemetryUrl(value, [], [])).toBeNull();
    }
    expect(allowedTelemetryUrl(url, ['example.com'], [])).toBeNull();
    expect(allowedTelemetryUrl(url, [], ['docs'])).toBeNull();
    expect(
      allowedTelemetryUrl('https://notexample.com/doc', ['example.com'], []),
    ).not.toBeNull();
  });

  it('bounds, validates, expires and deduplicates the session queue without replacing IDs', () => {
    const valid = bucket();
    expect(boundedTelemetryQueue([valid, valid], now)).toEqual([valid]);
    expect(boundedTelemetryQueue([valid], now + TELEMETRY_MAX_AGE + 1)).toEqual(
      [],
    );
    expect(boundedTelemetryQueue([valid], now - 1)).toEqual([]);
    expect(
      boundedTelemetryQueue(Array.from({length: 150}, bucket), now),
    ).toHaveLength(100);
    for (const metrics of [
      {readingSeconds: NaN},
      {readingSeconds: Infinity},
      {readingSeconds: -1},
      {readingSeconds: 16},
      {copyCount: 1.5},
      {clipboard: 'secret'},
    ]) {
      expect(boundedTelemetryQueue([{...valid, metrics}], now)).toEqual([]);
    }
    expect(
      boundedTelemetryQueue(
        [{...valid, startedAt: new Date(now - 300_001).toISOString()}],
        now,
      ),
    ).toEqual([]);
    expect(boundedTelemetryQueue([{...valid, page: {url}}], now)).toEqual([]);
    expect(boundedTelemetryQueue('bad storage', now)).toEqual([]);
  });
});
