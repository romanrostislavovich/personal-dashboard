import {ProcessCounters} from './process-counters';
import {currentTrace, newTraceId, withTrace} from './trace';

describe('process counters', () => {
  it('counts requests, server errors and the 95th percentile', () => {
    const counters = new ProcessCounters();
    expect(counters.p95()).toBeNull();
    for (let ms = 1; ms <= 100; ms++) {
      counters.request(ms === 100 ? 503 : 200, ms);
    }
    expect(counters.requests).toBe(100);
    expect(counters.serverErrors).toBe(1);
    expect(counters.p95()).toBe(95);
  });

  it('counts job runs and failures', () => {
    const counters = new ProcessCounters();
    counters.job(false);
    counters.job(true);
    expect([counters.jobRuns, counters.jobFailures]).toEqual([2, 1]);
  });
});

describe('trace', () => {
  it('keeps a request id that looks like one and makes up the rest', () => {
    expect(newTraceId('abc-123-def')).toBe('abc-123-def');
    expect(newTraceId('bad id with spaces')).toMatch(/^[0-9a-f]{12}$/);
    expect(newTraceId(null)).toMatch(/^[0-9a-f]{12}$/);
  });

  it('is current for everything awaited inside', async () => {
    expect(currentTrace()).toBeUndefined();
    await withTrace({id: 'run-1', job: 'tasks.remind'}, async () => {
      await Promise.resolve();
      expect(currentTrace()).toEqual({id: 'run-1', job: 'tasks.remind'});
    });
    expect(currentTrace()).toBeUndefined();
  });
});
