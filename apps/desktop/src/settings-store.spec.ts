import { describe, expect, it, vi } from 'vitest';
import { hasSmartBreakConsent, hasTelemetryConsent, loadSettings } from './settings-store';

vi.mock('electron', () => ({ app: { getPath: () => 'unused-test-path' } }));
vi.mock('node:fs', () => ({ existsSync: () => false }));

describe('desktop telemetry consent', () => {
  it('keeps smart breaks off by default and scopes their separate opt-in', () => {
    const settings = loadSettings();
    expect(settings.smartBreakConsent).toBeNull();
    expect(
      hasSmartBreakConsent(
        {
          ...settings,
          telemetryConsent: { serverUrl: 'https://one.example.com', deviceId: 'one' },
        },
        'https://one.example.com',
        'one',
      ),
    ).toBe(false);
    const enabled = {
      ...settings,
      smartBreakConsent: { serverUrl: 'https://one.example.com', deviceId: 'one' },
    };
    expect(hasSmartBreakConsent(enabled, 'https://one.example.com', 'one')).toBe(true);
    expect(hasSmartBreakConsent(enabled, 'https://two.example.com', 'one')).toBe(false);
    expect(hasSmartBreakConsent(enabled, 'https://one.example.com', 'two')).toBe(false);
    expect(hasSmartBreakConsent(enabled, null, 'one')).toBe(false);
    expect(hasSmartBreakConsent(enabled, 'https://one.example.com', null)).toBe(false);
    expect(hasTelemetryConsent(enabled, 'https://one.example.com', 'one')).toBe(false);
  });
  it('defaults off for a new installation', () => {
    expect(loadSettings().telemetryConsent).toBeNull();
    expect(hasTelemetryConsent(loadSettings(), 'https://dashboard.example.com', 'device')).toBe(
      false,
    );
  });

  it('requires an exact server and device match and does not reuse another account consent', () => {
    const settings = {
      ...loadSettings(),
      telemetryConsent: { serverUrl: 'https://dashboard.example.com', deviceId: 'device-one' },
    };
    expect(hasTelemetryConsent(settings, 'https://dashboard.example.com', 'device-one')).toBe(true);
    expect(hasTelemetryConsent(settings, 'https://other.example.com', 'device-one')).toBe(false);
    expect(hasTelemetryConsent(settings, 'https://dashboard.example.com', 'device-two')).toBe(
      false,
    );
    expect(hasTelemetryConsent(settings, null, 'device-one')).toBe(false);
    expect(hasTelemetryConsent(settings, 'https://dashboard.example.com', null)).toBe(false);
  });
});
