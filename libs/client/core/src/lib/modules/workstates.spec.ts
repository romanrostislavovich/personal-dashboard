import { describe, expect, it, vi } from 'vitest';
import { WorkstateInput } from '@pd/contracts';
import { ApiClient } from '../api-client';
import {
  TELEMETRY_READS,
  telemetryHistoryApi,
  WORKSTATE_CAPTURE_PATH,
  WORKSTATE_READS,
  workstatesApi,
} from './workstates';

const id = '8aac7fc0-8b2c-4afd-9c72-95a934eb5413';
describe('workstate requests', () => {
  it('centralizes validated reads, captures, deletes and retention endpoints', () => {
    const api = { read: vi.fn(), post: vi.fn(), delete: vi.fn() };
    const states = workstatesApi(api as unknown as ApiClient);
    const history = telemetryHistoryApi(api as unknown as ApiClient);
    const input = { id, capturedAt: '2026-10-21T10:00:00Z', capture: { browserUrls: [] } };
    states.capture(input);
    expect(api.post).toHaveBeenCalledWith('/api/activity/workstates', input);
    states.list({ search: 'dashboard' });
    expect(api.read).toHaveBeenCalledWith(WORKSTATE_READS.list({ search: 'dashboard' }));
    states.get(id);
    expect(api.read).toHaveBeenCalledWith(WORKSTATE_READS.get(id));
    history.list({ source: 'browser' });
    expect(api.read).toHaveBeenCalledWith(TELEMETRY_READS.list({ source: 'browser' }));
    states.remove(id);
    states.clear();
    states.prune();
    history.remove(id);
    history.clear();
    history.prune();
    for (const path of [
      `workstates/${id}`,
      'workstates',
      'workstates/expired',
      `telemetry/${id}`,
      'telemetry',
      'telemetry/expired',
    ]) {
      expect(api.delete).toHaveBeenCalledWith(`/api/activity/${path}`);
    }
    expect(WORKSTATE_CAPTURE_PATH).toBe('/api/activity/ingest/workstates');
    expect(() => states.capture({ ...input, deviceId: id } as WorkstateInput)).toThrow();
    expect(() => states.remove('../devices')).toThrow();
    expect(() => states.list({ limit: 101 })).toThrow();
  });

  it('validates restore responses and never executes them', async () => {
    const plan = { workstateId: id, requiresConfirmation: true, actions: [] };
    const post = vi.fn().mockResolvedValue(plan);
    const states = workstatesApi({ post } as unknown as ApiClient);
    expect(await states.restore(id)).toEqual(plan);
    expect(post).toHaveBeenCalledWith(`/api/activity/workstates/${id}/restore`, {});
    post.mockResolvedValue({ ...plan, actions: [{ kind: 'shell', command: 'git checkout main' }] });
    await expect(states.restore(id)).rejects.toThrow();
  });
});
