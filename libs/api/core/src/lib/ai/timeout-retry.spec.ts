import {describe, expect, it, vi} from 'vitest';
import {isTimeout, retryOnceOnTimeout} from './timeout-retry';

function timeout(): Error {
  const error = new Error('The operation was aborted due to timeout');
  error.name = 'TimeoutError';
  return error;
}

describe('retryOnceOnTimeout', () => {
  it('returns the answer of the second try after a timeout', async () => {
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce('report');
    const onTimeout = vi.fn();

    await expect(retryOnceOnTimeout(request, onTimeout)).resolves.toBe(
      'report',
    );
    expect(request).toHaveBeenCalledTimes(2);
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('gives up after the second timeout', async () => {
    const request = vi.fn(() => Promise.reject(timeout()));

    await expect(retryOnceOnTimeout(request)).rejects.toSatisfy(isTimeout);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not retry other failures', async () => {
    const request = vi.fn(() => Promise.reject(new Error('fetch failed')));

    await expect(retryOnceOnTimeout(request)).rejects.toThrow('fetch failed');
    expect(request).toHaveBeenCalledOnce();
  });
});
