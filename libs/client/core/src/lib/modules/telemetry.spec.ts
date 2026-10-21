import { describe, expect, it, vi } from 'vitest';
import { TelemetryBucket } from '@pd/contracts';
import { ApiClient } from '../api-client';
import { telemetryApi } from './telemetry';

describe('telemetry requests', () => {
  it('validates before anything reaches the transport', () => {
    const post = vi.fn();
    const api = telemetryApi({ post } as unknown as ApiClient);
    const unsafe = { text: 'a password' } as unknown as TelemetryBucket;
    expect(() => api.record([unsafe])).toThrow();
    expect(post).not.toHaveBeenCalled();
  });
  it('uses the shared authenticated endpoint', () => {
    const post = vi.fn();
    telemetryApi({ post } as unknown as ApiClient).record([]);
    expect(post).toHaveBeenCalledWith('/api/activity/telemetry', { buckets: [] });
  });
});
