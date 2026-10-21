import { describe, expect, it } from 'vitest';
import { sanitizeTelemetryText, sanitizeTelemetryUrl, telemetryBucketSchema } from './telemetry';

const bucket = {
  id: '00000000-0000-4000-8000-000000000001',
  source: 'desktop',
  startedAt: '2026-10-01T10:00:00Z',
  endedAt: '2026-10-01T10:05:00Z',
  metrics: { inputCount: 100, contextSwitches: 5, focusSeconds: 250 },
};

describe('telemetry boundary', () => {
  it('accepts aggregates, rejects raw content and invalid durations', () => {
    expect(telemetryBucketSchema.safeParse(bucket).success).toBe(true);
    expect(telemetryBucketSchema.safeParse({ ...bucket, text: 'private' }).success).toBe(false);
    expect(telemetryBucketSchema.safeParse({ ...bucket, metrics: { key: 'a' } }).success).toBe(
      false,
    );
    expect(telemetryBucketSchema.safeParse({ ...bucket, endedAt: bucket.startedAt }).success).toBe(
      false,
    );
    expect(
      telemetryBucketSchema.safeParse({ ...bucket, endedAt: '2026-10-01T10:06:00Z' }).success,
    ).toBe(false);
  });
  it('rejects impossible and non-finite measurements', () => {
    for (const metrics of [
      { inputCount: -1 },
      { focusEntropy: Infinity },
      { focusSeconds: 301 },
      { terminalFailures: 2, terminalCommands: 1 },
    ]) {
      expect(telemetryBucketSchema.safeParse({ ...bucket, metrics }).success).toBe(false);
    }
  });
  it('strips URL queries and fragments and rejects private resources', () => {
    expect(sanitizeTelemetryUrl('https://docs.example.com/guide?q=secret#token')).toBe(
      'https://docs.example.com/guide',
    );
    for (const url of [
      'file:///private',
      'javascript:alert(1)',
      'https://user:pass@example.com/',
      'http://127.0.0.1/',
      'http://localhost/',
      'https://example.com/account',
      'https://example.com/a%40example.com',
      'https://example.com/%ZZ',
    ]) {
      expect(sanitizeTelemetryUrl(url)).toBeNull();
    }
  });
  it('rejects secret-like and personal metadata', () => {
    for (const text of [
      'API_KEY=abc',
      'a@example.com',
      '4111 1111 1111 1111',
      'bearer abc',
      'a'.repeat(64),
    ]) {
      expect(sanitizeTelemetryText(text)).toBeNull();
    }
    expect(sanitizeTelemetryText(' TypeScript\n guide ')).toBe('TypeScript guide');
  });
  it('does not accept unsanitized browser URLs', () => {
    expect(
      telemetryBucketSchema.safeParse({
        ...bucket,
        source: 'browser',
        page: { url: 'https://example.com/?token=abc' },
      }).success,
    ).toBe(false);
  });
});
